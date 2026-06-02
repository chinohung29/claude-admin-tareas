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
        CREATE TABLE IF NOT EXISTS mesas (
            id INTEGER PRIMARY KEY,
            nombre TEXT NOT NULL,
            capacidad INTEGER NOT NULL DEFAULT 4,
            estado TEXT NOT NULL DEFAULT 'libre'
                CHECK (estado IN ('libre', 'ocupada', 'reservada'))
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
                CHECK (estado IN ('pendiente', 'preparando', 'listo', 'entregado')),
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
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """)

    if c.execute("SELECT count(*) FROM mesas").fetchone()[0] == 0:
        for i in range(1, 31):
            cap = 2 if i <= 10 else (4 if i <= 22 else 6)
            c.execute("INSERT INTO mesas (id, nombre, capacidad) VALUES (?, ?, ?)",
                      (i, f"Mesa {i}", cap))

    if c.execute("SELECT count(*) FROM categorias").fetchone()[0] == 0:
        cats = [
            (1, "Entradas", 1), (2, "Platos principales del día", 2),
            (3, "Para compartir", 3), (4, "Carnes", 4), (5, "Pastas", 5),
            (6, "Postres", 6), (7, "Bebidas sin alcohol", 7),
            (8, "Cervezas", 8), (9, "Vinos", 9), (10, "Coctelería", 10),
        ]
        c.executemany("INSERT INTO categorias (id, nombre, orden) VALUES (?, ?, ?)", cats)

        items = [
            (1, "Rabas crocantes", 6900, "https://images.unsplash.com/photo-1604909052743-94e838986d24?auto=format&fit=crop&w=500&q=80"),
            (1, "Empanadas del dragón x3", 5400, "https://images.unsplash.com/photo-1509722747041-616f39b57569?auto=format&fit=crop&w=500&q=80"),
            (2, "Ramen del Dragón", 9800, "https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=500&q=80"),
            (2, "Wok de pollo y verduras", 8700, "https://images.unsplash.com/photo-1512058564366-18510be2db19?auto=format&fit=crop&w=500&q=80"),
            (3, "Tabla oriental mixta", 14500, "https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=500&q=80"),
            (3, "Picada dragón para dos", 12800, "https://images.unsplash.com/photo-1541529086526-db283c563270?auto=format&fit=crop&w=500&q=80"),
            (4, "Bife sellado al fuego rojo", 13200, "https://images.unsplash.com/photo-1558030006-450675393462?auto=format&fit=crop&w=500&q=80"),
            (4, "Entraña a la parrilla", 11900, "https://images.unsplash.com/photo-1529692236671-f1f6cf9683ba?auto=format&fit=crop&w=500&q=80"),
            (5, "Sorrentinos de calabaza", 8900, "https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?auto=format&fit=crop&w=500&q=80"),
            (5, "Ñoquis a la bolognesa", 7800, "https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?auto=format&fit=crop&w=500&q=80"),
            (6, "Volcán de chocolate", 5200, "https://images.unsplash.com/photo-1606313564200-e75d5e30476c?auto=format&fit=crop&w=500&q=80"),
            (6, "Flan casero con dulce de leche", 4100, "https://images.unsplash.com/photo-1488477181946-6428a0291777?auto=format&fit=crop&w=500&q=80"),
            (7, "Limonada imperial", 3100, "https://images.unsplash.com/photo-1621263764928-df1444c5e859?auto=format&fit=crop&w=500&q=80"),
            (7, "Agua saborizada", 2500, "https://images.unsplash.com/photo-1560023907-5f339617ea55?auto=format&fit=crop&w=500&q=80"),
            (8, "Cerveza roja artesanal", 3900, "https://images.unsplash.com/photo-1608270586620-248524c67de9?auto=format&fit=crop&w=500&q=80"),
            (8, "IPA del dragón", 4200, "https://images.unsplash.com/photo-1535958636474-b021ee887b13?auto=format&fit=crop&w=500&q=80"),
            (9, "Malbec reserva", 8500, "https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?auto=format&fit=crop&w=500&q=80"),
            (9, "Torrontés blanco", 7200, "https://images.unsplash.com/photo-1474722883778-792e7990302f?auto=format&fit=crop&w=500&q=80"),
            (10, "Negroni Dragón", 6200, "https://images.unsplash.com/photo-1551024709-8f23befc6f87?auto=format&fit=crop&w=500&q=80"),
            (10, "Gin Tonic premium", 5800, "https://images.unsplash.com/photo-1536935338788-846bb9981813?auto=format&fit=crop&w=500&q=80"),
        ]
        c.executemany(
            "INSERT INTO menu_items (categoria_id, nombre, precio, imagen) VALUES (?, ?, ?, ?)",
            items
        )

    conn.commit()
    conn.close()
