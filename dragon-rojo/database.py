import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "dragon_rojo.db")


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    conn = get_db()
    c = conn.cursor()

    c.execute("""
        CREATE TABLE IF NOT EXISTS usuarios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre TEXT NOT NULL,
            rol TEXT NOT NULL DEFAULT 'mozo'
                CHECK (rol IN ('mozo', 'admin', 'cocina', 'barra')),
            activo INTEGER NOT NULL DEFAULT 1
        )
    """)

    c.execute("""
        CREATE TABLE IF NOT EXISTS mesas (
            id INTEGER PRIMARY KEY,
            nombre TEXT NOT NULL,
            capacidad INTEGER NOT NULL DEFAULT 4,
            estado TEXT NOT NULL DEFAULT 'libre'
                CHECK (estado IN ('libre', 'ocupada', 'reservada')),
            mozo_id INTEGER REFERENCES usuarios(id)
        )
    """)

    c.execute("""
        CREATE TABLE IF NOT EXISTS categorias (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre TEXT NOT NULL UNIQUE,
            orden INTEGER NOT NULL DEFAULT 0
        )
    """)

    c.execute("""
        CREATE TABLE IF NOT EXISTS menu_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            categoria_id INTEGER NOT NULL REFERENCES categorias(id),
            nombre TEXT NOT NULL,
            precio REAL NOT NULL,
            imagen TEXT,
            disponible INTEGER NOT NULL DEFAULT 1
        )
    """)

    c.execute("""
        CREATE TABLE IF NOT EXISTS reservas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            mesa_id INTEGER NOT NULL REFERENCES mesas(id),
            nombre TEXT NOT NULL,
            telefono TEXT,
            personas INTEGER NOT NULL,
            horario TEXT NOT NULL,
            observaciones TEXT,
            fecha TEXT NOT NULL DEFAULT (date('now')),
            estado TEXT NOT NULL DEFAULT 'confirmada'
                CHECK (estado IN ('confirmada', 'cancelada', 'completada')),
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """)

    c.execute("""
        CREATE TABLE IF NOT EXISTS pedidos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            mesa_id INTEGER NOT NULL REFERENCES mesas(id),
            area TEXT NOT NULL CHECK (area IN ('cocina', 'barra')),
            estado TEXT NOT NULL DEFAULT 'pendiente'
                CHECK (estado IN ('pendiente', 'preparando', 'listo', 'entregado', 'cancelado')),
            mozo_id INTEGER REFERENCES usuarios(id),
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """)

    c.execute("""
        CREATE TABLE IF NOT EXISTS pedido_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            pedido_id INTEGER NOT NULL REFERENCES pedidos(id),
            menu_item_id INTEGER REFERENCES menu_items(id),
            descripcion TEXT NOT NULL,
            cantidad INTEGER NOT NULL DEFAULT 1,
            precio_unitario REAL NOT NULL DEFAULT 0
        )
    """)

    c.execute("""
        CREATE TABLE IF NOT EXISTS cuentas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            mesa_id INTEGER NOT NULL REFERENCES mesas(id),
            medio_pago TEXT NOT NULL,
            total REAL NOT NULL DEFAULT 0,
            cerrada_por INTEGER REFERENCES usuarios(id),
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """)

    # --- Seed data ---
    if c.execute("SELECT count(*) FROM usuarios").fetchone()[0] == 0:
        mozos = [
            ("Carlos", "mozo"), ("Lucía", "mozo"), ("Martín", "mozo"),
            ("Admin", "admin"), ("Cocina", "cocina"), ("Barra", "barra"),
        ]
        c.executemany("INSERT INTO usuarios (nombre, rol) VALUES (?, ?)", mozos)

    if c.execute("SELECT count(*) FROM mesas").fetchone()[0] == 0:
        for i in range(1, 31):
            cap = 2 if i <= 8 else (4 if i <= 20 else (6 if i <= 26 else 8))
            c.execute("INSERT INTO mesas (id, nombre, capacidad) VALUES (?, ?, ?)",
                      (i, f"Mesa {i}", cap))

    if c.execute("SELECT count(*) FROM categorias").fetchone()[0] == 0:
        cats = [
            (1, "Platos Principales", 1),
            (2, "Bebidas sin Alcohol", 2),
            (3, "Bebidas con Alcohol", 3),
            (4, "Postres", 4),
        ]
        c.executemany("INSERT INTO categorias (id, nombre, orden) VALUES (?, ?, ?)", cats)

        items = [
            # 10 platos de comida china
            (1, "Pollo agridulce", 8900),
            (1, "Cerdo char siu", 9200),
            (1, "Chop suey de verduras", 7500),
            (1, "Arroz frito con langostinos", 10800),
            (1, "Dim sum variado (8 pzas)", 9500),
            (1, "Pato laqueado", 14200),
            (1, "Wok de carne y brotes de soja", 9800),
            (1, "Chow mein de pollo", 8400),
            (1, "Tofu mapo picante", 7900),
            (1, "Costillitas de cerdo glaseadas", 11500),
            # 4 bebidas sin alcohol
            (2, "Agua mineral 500ml", 1800),
            (2, "Gaseosa línea Coca-Cola", 2200),
            (2, "Jugo de naranja exprimido", 3100),
            (2, "Té jazmín frío", 2800),
            # 10 bebidas con alcohol
            (3, "Cerveza Tsingtao 600ml", 3900),
            (3, "Cerveza artesanal roja", 4200),
            (3, "Sake frío 180ml", 5500),
            (3, "Sake caliente 180ml", 5500),
            (3, "Malbec reserva copa", 4800),
            (3, "Malbec reserva botella", 16500),
            (3, "Gin tonic premium", 5800),
            (3, "Negroni Dragón", 6200),
            (3, "Fernet con Coca", 4500),
            (3, "Whisky Johnny Walker etiqueta negra", 7200),
            # 5 postres
            (4, "Banana frita con miel y sésamo", 4800),
            (4, "Helado de lichi", 3900),
            (4, "Rollitos de crema y nutella", 5200),
            (4, "Flan casero con dulce de leche", 4100),
            (4, "Volcán de chocolate", 5600),
        ]
        c.executemany(
            "INSERT INTO menu_items (categoria_id, nombre, precio) VALUES (?, ?, ?)",
            items
        )

    conn.commit()
    conn.close()
