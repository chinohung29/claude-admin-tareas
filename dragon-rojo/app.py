from flask import Flask, jsonify, request, send_from_directory
from database import get_db, init_db

app = Flask(__name__, static_folder="static")


@app.route("/")
def index():
    return send_from_directory("static", "index.html")


# --- Mesas ---

@app.route("/api/mesas")
def listar_mesas():
    db = get_db()
    rows = db.execute("SELECT * FROM mesas ORDER BY id").fetchall()
    db.close()
    return jsonify([dict(r) for r in rows])


@app.route("/api/mesas/<int:mesa_id>", methods=["PATCH"])
def actualizar_mesa(mesa_id):
    data = request.json
    estado = data.get("estado")
    if estado not in ("libre", "ocupada", "reservada"):
        return jsonify({"error": "Estado inválido"}), 400
    db = get_db()
    db.execute("UPDATE mesas SET estado = ? WHERE id = ?", (estado, mesa_id))
    db.commit()
    row = db.execute("SELECT * FROM mesas WHERE id = ?", (mesa_id,)).fetchone()
    db.close()
    return jsonify(dict(row))


# --- Carta / Menú ---

@app.route("/api/menu")
def listar_menu():
    db = get_db()
    cats = db.execute("SELECT * FROM categorias ORDER BY orden").fetchall()
    result = []
    for cat in cats:
        items = db.execute(
            "SELECT * FROM menu_items WHERE categoria_id = ? AND disponible = 1 ORDER BY nombre",
            (cat["id"],)
        ).fetchall()
        result.append({
            "id": cat["id"],
            "nombre": cat["nombre"],
            "items": [dict(i) for i in items],
        })
    db.close()
    return jsonify(result)


# --- Reservas ---

@app.route("/api/reservas", methods=["GET"])
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
    required = ["mesa_id", "nombre", "personas", "horario"]
    for field in required:
        if not data.get(field):
            return jsonify({"error": f"Falta el campo: {field}"}), 400

    db = get_db()
    existing = db.execute(
        "SELECT id FROM reservas WHERE mesa_id = ? AND horario = ? AND fecha = date('now') AND estado = 'confirmada'",
        (data["mesa_id"], data["horario"])
    ).fetchone()
    if existing:
        db.close()
        return jsonify({"error": "Esa mesa ya tiene reserva a ese horario"}), 409

    db.execute(
        "INSERT INTO reservas (mesa_id, nombre, telefono, personas, horario, observaciones) VALUES (?, ?, ?, ?, ?, ?)",
        (data["mesa_id"], data["nombre"], data.get("telefono", ""),
         data["personas"], data["horario"], data.get("observaciones", ""))
    )
    db.execute("UPDATE mesas SET estado = 'reservada' WHERE id = ?", (data["mesa_id"],))
    db.commit()
    reserva = db.execute("SELECT * FROM reservas ORDER BY id DESC LIMIT 1").fetchone()
    db.close()
    return jsonify(dict(reserva)), 201


@app.route("/api/reservas/<int:reserva_id>", methods=["DELETE"])
def cancelar_reserva(reserva_id):
    db = get_db()
    reserva = db.execute("SELECT * FROM reservas WHERE id = ?", (reserva_id,)).fetchone()
    if not reserva:
        db.close()
        return jsonify({"error": "Reserva no encontrada"}), 404
    db.execute("UPDATE reservas SET estado = 'cancelada' WHERE id = ?", (reserva_id,))
    db.execute("UPDATE mesas SET estado = 'libre' WHERE id = ?", (reserva["mesa_id"],))
    db.commit()
    db.close()
    return jsonify({"ok": True})


# --- Pedidos ---

@app.route("/api/pedidos", methods=["GET"])
def listar_pedidos():
    db = get_db()
    pedidos = db.execute("""
        SELECT p.*, m.nombre as mesa_nombre
        FROM pedidos p JOIN mesas m ON p.mesa_id = m.id
        WHERE p.estado IN ('pendiente', 'preparando', 'listo')
        ORDER BY p.created_at
    """).fetchall()
    result = []
    for p in pedidos:
        items = db.execute(
            "SELECT * FROM pedido_items WHERE pedido_id = ?", (p["id"],)
        ).fetchall()
        d = dict(p)
        d["items"] = [dict(i) for i in items]
        result.append(d)
    db.close()
    return jsonify(result)


@app.route("/api/pedidos", methods=["POST"])
def crear_pedido():
    data = request.json
    if not data.get("mesa_id") or not data.get("area"):
        return jsonify({"error": "Faltan campos obligatorios"}), 400
    if data["area"] not in ("cocina", "barra"):
        return jsonify({"error": "Área inválida"}), 400
    items = data.get("items", [])
    if not items:
        return jsonify({"error": "El pedido necesita al menos un item"}), 400

    db = get_db()
    cur = db.execute(
        "INSERT INTO pedidos (mesa_id, area) VALUES (?, ?)",
        (data["mesa_id"], data["area"])
    )
    pedido_id = cur.lastrowid
    for item in items:
        db.execute(
            "INSERT INTO pedido_items (pedido_id, menu_item_id, descripcion, cantidad, precio_unitario) VALUES (?, ?, ?, ?, ?)",
            (pedido_id, item.get("menu_item_id"), item["descripcion"],
             item.get("cantidad", 1), item.get("precio_unitario", 0))
        )
    db.execute("UPDATE mesas SET estado = 'ocupada' WHERE id = ?", (data["mesa_id"],))
    db.commit()
    pedido = db.execute("SELECT * FROM pedidos WHERE id = ?", (pedido_id,)).fetchone()
    db.close()
    return jsonify(dict(pedido)), 201


@app.route("/api/pedidos/<int:pedido_id>", methods=["PATCH"])
def actualizar_pedido(pedido_id):
    data = request.json
    estado = data.get("estado")
    if estado not in ("pendiente", "preparando", "listo", "entregado"):
        return jsonify({"error": "Estado inválido"}), 400
    db = get_db()
    db.execute("UPDATE pedidos SET estado = ? WHERE id = ?", (estado, pedido_id))
    db.commit()
    pedido = db.execute("SELECT * FROM pedidos WHERE id = ?", (pedido_id,)).fetchone()
    db.close()
    return jsonify(dict(pedido))


# --- Cuentas ---

@app.route("/api/cuentas", methods=["POST"])
def cerrar_cuenta():
    data = request.json
    mesa_id = data.get("mesa_id")
    medio_pago = data.get("medio_pago")
    if not mesa_id or not medio_pago:
        return jsonify({"error": "Faltan campos"}), 400

    db = get_db()
    pedidos = db.execute("""
        SELECT pi.precio_unitario, pi.cantidad
        FROM pedidos p
        JOIN pedido_items pi ON pi.pedido_id = p.id
        WHERE p.mesa_id = ? AND p.estado != 'entregado'
    """, (mesa_id,)).fetchall()

    total = sum(r["precio_unitario"] * r["cantidad"] for r in pedidos)

    db.execute("UPDATE pedidos SET estado = 'entregado' WHERE mesa_id = ? AND estado != 'entregado'",
               (mesa_id,))
    db.execute("INSERT INTO cuentas (mesa_id, medio_pago, total) VALUES (?, ?, ?)",
               (mesa_id, medio_pago, total))
    db.execute("UPDATE mesas SET estado = 'libre' WHERE id = ?", (mesa_id,))
    db.commit()
    cuenta = db.execute("SELECT * FROM cuentas ORDER BY id DESC LIMIT 1").fetchone()
    db.close()
    return jsonify(dict(cuenta)), 201


@app.route("/api/cuentas/preview/<int:mesa_id>")
def preview_cuenta(mesa_id):
    db = get_db()
    items = db.execute("""
        SELECT pi.descripcion, pi.cantidad, pi.precio_unitario,
               (pi.precio_unitario * pi.cantidad) as subtotal
        FROM pedidos p
        JOIN pedido_items pi ON pi.pedido_id = p.id
        WHERE p.mesa_id = ? AND p.estado != 'entregado'
    """, (mesa_id,)).fetchall()
    total = sum(r["subtotal"] for r in items)
    db.close()
    return jsonify({"items": [dict(i) for i in items], "total": total})


if __name__ == "__main__":
    init_db()
    app.run(host="0.0.0.0", port=5000, debug=True)
