from flask import Flask, jsonify, request, send_from_directory
from database import get_db, init_db

app = Flask(__name__, static_folder="static")


@app.route("/")
def index():
    return send_from_directory("static", "index.html")


# ---------- Usuarios ----------

@app.route("/api/usuarios")
def listar_usuarios():
    db = get_db()
    rows = db.execute("SELECT * FROM usuarios WHERE activo = 1 ORDER BY nombre").fetchall()
    db.close()
    return jsonify([dict(r) for r in rows])


# ---------- Mesas ----------

@app.route("/api/mesas")
def listar_mesas():
    db = get_db()
    rows = db.execute("""
        SELECT m.*, u.nombre as mozo_nombre
        FROM mesas m LEFT JOIN usuarios u ON m.mozo_id = u.id
        ORDER BY m.id
    """).fetchall()
    db.close()
    return jsonify([dict(r) for r in rows])


@app.route("/api/mesas/<int:mesa_id>", methods=["PATCH"])
def actualizar_mesa(mesa_id):
    data = request.json
    db = get_db()
    if "estado" in data:
        estado = data["estado"]
        if estado not in ("libre", "ocupada", "reservada"):
            db.close()
            return jsonify({"error": "Estado inválido"}), 400
        db.execute("UPDATE mesas SET estado = ? WHERE id = ?", (estado, mesa_id))
        if estado == "libre":
            db.execute("UPDATE mesas SET mozo_id = NULL WHERE id = ?", (mesa_id,))
    if "mozo_id" in data:
        mozo_id = data["mozo_id"] if data["mozo_id"] else None
        db.execute("UPDATE mesas SET mozo_id = ? WHERE id = ?", (mozo_id, mesa_id))
    db.commit()
    row = db.execute("""
        SELECT m.*, u.nombre as mozo_nombre
        FROM mesas m LEFT JOIN usuarios u ON m.mozo_id = u.id
        WHERE m.id = ?
    """, (mesa_id,)).fetchone()
    db.close()
    return jsonify(dict(row))


@app.route("/api/mesas/<int:mesa_id>/trasladar", methods=["POST"])
def trasladar_mesa(mesa_id):
    data = request.json
    destino_id = data.get("destino_id")
    if not destino_id:
        return jsonify({"error": "Falta mesa destino"}), 400
    db = get_db()
    origen = db.execute("SELECT * FROM mesas WHERE id = ?", (mesa_id,)).fetchone()
    destino = db.execute("SELECT * FROM mesas WHERE id = ?", (destino_id,)).fetchone()
    if not origen or not destino:
        db.close()
        return jsonify({"error": "Mesa no encontrada"}), 404
    if destino["estado"] != "libre":
        db.close()
        return jsonify({"error": "La mesa destino no está libre"}), 409

    db.execute("UPDATE pedidos SET mesa_id = ? WHERE mesa_id = ? AND estado NOT IN ('entregado','cancelado')",
               (destino_id, mesa_id))
    db.execute("UPDATE mesas SET estado = 'ocupada', mozo_id = ? WHERE id = ?",
               (origen["mozo_id"], destino_id))
    db.execute("UPDATE mesas SET estado = 'libre', mozo_id = NULL WHERE id = ?", (mesa_id,))
    db.commit()
    db.close()
    return jsonify({"ok": True, "mensaje": f"Mesa {mesa_id} trasladada a mesa {destino_id}"})


# ---------- Menú ----------

@app.route("/api/menu")
def listar_menu():
    db = get_db()
    cats = db.execute("SELECT * FROM categorias ORDER BY orden").fetchall()
    result = []
    for cat in cats:
        items = db.execute(
            "SELECT * FROM menu_items WHERE categoria_id = ? AND disponible = 1 ORDER BY id",
            (cat["id"],)
        ).fetchall()
        result.append({
            "id": cat["id"],
            "nombre": cat["nombre"],
            "items": [dict(i) for i in items],
        })
    db.close()
    return jsonify(result)


# ---------- Reservas ----------

@app.route("/api/reservas")
def listar_reservas():
    db = get_db()
    rows = db.execute("""
        SELECT r.*, m.nombre as mesa_nombre
        FROM reservas r JOIN mesas m ON r.mesa_id = m.id
        WHERE r.fecha = date('now') AND r.estado = 'confirmada'
        ORDER BY r.horario
    """).fetchall()
    db.close()
    return jsonify([dict(r) for r in rows])


@app.route("/api/reservas", methods=["POST"])
def crear_reserva():
    data = request.json
    for field in ["mesa_id", "nombre", "personas", "horario"]:
        if not data.get(field):
            return jsonify({"error": f"Falta: {field}"}), 400
    db = get_db()
    dup = db.execute(
        "SELECT id FROM reservas WHERE mesa_id = ? AND horario = ? AND fecha = date('now') AND estado = 'confirmada'",
        (data["mesa_id"], data["horario"])
    ).fetchone()
    if dup:
        db.close()
        return jsonify({"error": "Mesa ya reservada a ese horario"}), 409
    db.execute(
        "INSERT INTO reservas (mesa_id, nombre, telefono, personas, horario, observaciones) VALUES (?,?,?,?,?,?)",
        (data["mesa_id"], data["nombre"], data.get("telefono", ""),
         data["personas"], data["horario"], data.get("observaciones", ""))
    )
    db.execute("UPDATE mesas SET estado = 'reservada' WHERE id = ?", (data["mesa_id"],))
    db.commit()
    r = db.execute("SELECT * FROM reservas ORDER BY id DESC LIMIT 1").fetchone()
    db.close()
    return jsonify(dict(r)), 201


@app.route("/api/reservas/<int:rid>", methods=["DELETE"])
def cancelar_reserva(rid):
    db = get_db()
    r = db.execute("SELECT * FROM reservas WHERE id = ?", (rid,)).fetchone()
    if not r:
        db.close()
        return jsonify({"error": "No encontrada"}), 404
    db.execute("UPDATE reservas SET estado = 'cancelada' WHERE id = ?", (rid,))
    db.execute("UPDATE mesas SET estado = 'libre' WHERE id = ?", (r["mesa_id"],))
    db.commit()
    db.close()
    return jsonify({"ok": True})


# ---------- Pedidos ----------

@app.route("/api/pedidos")
def listar_pedidos():
    area = request.args.get("area")
    db = get_db()
    query = """
        SELECT p.*, m.nombre as mesa_nombre, u.nombre as mozo_nombre
        FROM pedidos p
        JOIN mesas m ON p.mesa_id = m.id
        LEFT JOIN usuarios u ON p.mozo_id = u.id
        WHERE p.estado IN ('pendiente', 'preparando', 'listo')
    """
    params = []
    if area:
        query += " AND p.area = ?"
        params.append(area)
    query += " ORDER BY p.created_at"
    pedidos = db.execute(query, params).fetchall()
    result = []
    for p in pedidos:
        items = db.execute("SELECT * FROM pedido_items WHERE pedido_id = ?", (p["id"],)).fetchall()
        d = dict(p)
        d["items"] = [dict(i) for i in items]
        result.append(d)
    db.close()
    return jsonify(result)


@app.route("/api/pedidos", methods=["POST"])
def crear_pedido():
    data = request.json
    if not data.get("mesa_id") or not data.get("area") or not data.get("items"):
        return jsonify({"error": "Faltan campos"}), 400
    if data["area"] not in ("cocina", "barra"):
        return jsonify({"error": "Área inválida"}), 400
    db = get_db()
    cur = db.execute(
        "INSERT INTO pedidos (mesa_id, area, mozo_id) VALUES (?, ?, ?)",
        (data["mesa_id"], data["area"], data.get("mozo_id"))
    )
    pid = cur.lastrowid
    for item in data["items"]:
        db.execute(
            "INSERT INTO pedido_items (pedido_id, menu_item_id, descripcion, cantidad, precio_unitario) VALUES (?,?,?,?,?)",
            (pid, item.get("menu_item_id"), item["descripcion"],
             item.get("cantidad", 1), item.get("precio_unitario", 0))
        )
    db.execute("UPDATE mesas SET estado = 'ocupada' WHERE id = ?", (data["mesa_id"],))
    db.commit()
    p = db.execute("SELECT * FROM pedidos WHERE id = ?", (pid,)).fetchone()
    db.close()
    return jsonify(dict(p)), 201


@app.route("/api/pedidos/<int:pid>", methods=["PATCH"])
def actualizar_pedido(pid):
    data = request.json
    estado = data.get("estado")
    if estado not in ("pendiente", "preparando", "listo", "entregado", "cancelado"):
        return jsonify({"error": "Estado inválido"}), 400
    db = get_db()
    db.execute("UPDATE pedidos SET estado = ? WHERE id = ?", (estado, pid))
    db.commit()
    p = db.execute("SELECT * FROM pedidos WHERE id = ?", (pid,)).fetchone()
    db.close()
    return jsonify(dict(p))


# ---------- Cuentas ----------

@app.route("/api/cuentas/preview/<int:mesa_id>")
def preview_cuenta(mesa_id):
    db = get_db()
    items = db.execute("""
        SELECT pi.descripcion, pi.cantidad, pi.precio_unitario,
               (pi.precio_unitario * pi.cantidad) as subtotal
        FROM pedidos p
        JOIN pedido_items pi ON pi.pedido_id = p.id
        WHERE p.mesa_id = ? AND p.estado NOT IN ('cancelado')
        AND p.id NOT IN (SELECT pedido_id FROM pedido_items pi2
                         JOIN pedidos p2 ON pi2.pedido_id = p2.id
                         WHERE p2.mesa_id = ? AND p2.estado = 'entregado'
                         AND p2.id IN (
                             SELECT p3.id FROM pedidos p3
                             JOIN cuentas c ON c.mesa_id = p3.mesa_id
                             WHERE p3.created_at <= c.created_at
                         ))
    """, (mesa_id, mesa_id)).fetchall()
    # Simpler approach: get all non-cancelled items for mesa that haven't been billed
    items = db.execute("""
        SELECT pi.descripcion,
               SUM(pi.cantidad) as cantidad,
               pi.precio_unitario,
               SUM(pi.precio_unitario * pi.cantidad) as subtotal
        FROM pedidos p
        JOIN pedido_items pi ON pi.pedido_id = p.id
        WHERE p.mesa_id = ? AND p.estado != 'cancelado'
        GROUP BY pi.descripcion, pi.precio_unitario
    """, (mesa_id,)).fetchall()
    total = sum(r["subtotal"] for r in items)
    db.close()
    return jsonify({"items": [dict(i) for i in items], "total": total})


@app.route("/api/cuentas", methods=["POST"])
def cerrar_cuenta():
    data = request.json
    mesa_id = data.get("mesa_id")
    medio_pago = data.get("medio_pago")
    if not mesa_id or not medio_pago:
        return jsonify({"error": "Faltan campos"}), 400
    db = get_db()
    items = db.execute("""
        SELECT SUM(pi.precio_unitario * pi.cantidad) as total
        FROM pedidos p JOIN pedido_items pi ON pi.pedido_id = p.id
        WHERE p.mesa_id = ? AND p.estado != 'cancelado'
    """, (mesa_id,)).fetchone()
    total = items["total"] or 0
    db.execute("UPDATE pedidos SET estado = 'entregado' WHERE mesa_id = ? AND estado NOT IN ('entregado','cancelado')",
               (mesa_id,))
    db.execute("INSERT INTO cuentas (mesa_id, medio_pago, total, cerrada_por) VALUES (?,?,?,?)",
               (mesa_id, medio_pago, total, data.get("cerrada_por")))
    db.execute("UPDATE mesas SET estado = 'libre', mozo_id = NULL WHERE id = ?", (mesa_id,))
    db.commit()
    cuenta = db.execute("SELECT * FROM cuentas ORDER BY id DESC LIMIT 1").fetchone()
    db.close()
    return jsonify(dict(cuenta)), 201


if __name__ == "__main__":
    init_db()
    app.run(host="0.0.0.0", port=5000, debug=True)
