-- Migration 001: Initial Schema
-- Tables: roles, users, refresh_tokens, addresses, categories, menu_items, carts, cart_items, orders, order_items, payments, audit_logs, audit_chain_head

CREATE TABLE IF NOT EXISTS roles (
  id   TINYINT UNSIGNED NOT NULL PRIMARY KEY,
  name VARCHAR(20) NOT NULL UNIQUE
) ENGINE=InnoDB;

INSERT IGNORE INTO roles (id, name) VALUES (1, 'admin'), (2, 'user'), (4, 'kasir');

CREATE TABLE IF NOT EXISTS users (
  id                 CHAR(36) NOT NULL PRIMARY KEY,
  role_id            TINYINT UNSIGNED NOT NULL,
  full_name          VARCHAR(100) NOT NULL,
  email              VARCHAR(150) NOT NULL,
  phone              VARCHAR(512) NULL,
  password_hash      VARCHAR(255) NOT NULL,
  mfa_secret         VARCHAR(512) NULL,
  is_active          TINYINT(1) NOT NULL DEFAULT 1,
  failed_login_count INT NOT NULL DEFAULT 0,
  locked_until       DATETIME(3) NULL,
  created_at         DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at         DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_users_email (email),
  CONSTRAINT fk_users_role FOREIGN KEY (role_id) REFERENCES roles(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id         CHAR(36) NOT NULL PRIMARY KEY,
  user_id    CHAR(36) NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  revoked_at DATETIME(3) NULL,
  ip_address VARCHAR(45) NULL,
  user_agent VARCHAR(255) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_refresh_hash (token_hash),
  KEY idx_refresh_user (user_id),
  CONSTRAINT fk_refresh_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS addresses (
  id           CHAR(36) NOT NULL PRIMARY KEY,
  user_id      CHAR(36) NOT NULL,
  label        VARCHAR(30) NOT NULL,
  address_line VARCHAR(1024) NOT NULL,
  city         VARCHAR(80) NOT NULL,
  postal_code  VARCHAR(10) NULL,
  is_default   TINYINT(1) NOT NULL DEFAULT 0,
  KEY idx_addresses_user (user_id),
  CONSTRAINT fk_addr_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS categories (
  id   INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(80) NOT NULL UNIQUE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS menu_items (
  id           CHAR(36) NOT NULL PRIMARY KEY,
  category_id  INT UNSIGNED NOT NULL,
  name         VARCHAR(120) NOT NULL,
  description  TEXT NULL,
  price        DECIMAL(12,2) NOT NULL,
  stock        INT NOT NULL DEFAULT 0,
  image_url    VARCHAR(255) NULL,
  is_available TINYINT(1) NOT NULL DEFAULT 1,
  created_by   CHAR(36) NULL,
  created_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY idx_menu_category (category_id),
  CONSTRAINT chk_menu_price CHECK (price >= 0),
  CONSTRAINT chk_menu_stock CHECK (stock >= 0),
  CONSTRAINT fk_menu_category FOREIGN KEY (category_id) REFERENCES categories(id),
  CONSTRAINT fk_menu_creator  FOREIGN KEY (created_by)  REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS carts (
  id         CHAR(36) NOT NULL PRIMARY KEY,
  user_id    CHAR(36) NOT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_cart_user (user_id),
  CONSTRAINT fk_cart_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS cart_items (
  id           CHAR(36) NOT NULL PRIMARY KEY,
  cart_id      CHAR(36) NOT NULL,
  menu_item_id CHAR(36) NOT NULL,
  quantity     INT NOT NULL,
  UNIQUE KEY uq_cart_menu (cart_id, menu_item_id),
  CONSTRAINT chk_cart_qty CHECK (quantity > 0),
  CONSTRAINT fk_ci_cart FOREIGN KEY (cart_id) REFERENCES carts(id) ON DELETE CASCADE,
  CONSTRAINT fk_ci_menu FOREIGN KEY (menu_item_id) REFERENCES menu_items(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS orders (
  id           CHAR(36) NOT NULL PRIMARY KEY,
  order_code   VARCHAR(20) NOT NULL,
  user_id      CHAR(36) NOT NULL,
  address_id   CHAR(36) NOT NULL,
  status       ENUM('pending','paid','preparing','delivering','completed','cancelled') NOT NULL DEFAULT 'pending',
  total_amount DECIMAL(12,2) NOT NULL,
  notes        TEXT NULL,
  created_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_order_code (order_code),
  KEY idx_orders_user (user_id),
  KEY idx_orders_status (status),
  CONSTRAINT chk_order_total CHECK (total_amount >= 0),
  CONSTRAINT fk_order_user FOREIGN KEY (user_id)    REFERENCES users(id),
  CONSTRAINT fk_order_addr FOREIGN KEY (address_id) REFERENCES addresses(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS order_items (
  id           CHAR(36) NOT NULL PRIMARY KEY,
  order_id     CHAR(36) NOT NULL,
  menu_item_id CHAR(36) NOT NULL,
  quantity     INT NOT NULL,
  unit_price   DECIMAL(12,2) NOT NULL,
  KEY idx_oi_order (order_id),
  CONSTRAINT chk_oi_qty   CHECK (quantity > 0),
  CONSTRAINT chk_oi_price CHECK (unit_price >= 0),
  CONSTRAINT fk_oi_order FOREIGN KEY (order_id)     REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_oi_menu  FOREIGN KEY (menu_item_id) REFERENCES menu_items(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS payments (
  id          CHAR(36) NOT NULL PRIMARY KEY,
  order_id    CHAR(36) NOT NULL,
  gateway_ref VARCHAR(100) NULL,
  method      VARCHAR(30) NULL,
  amount      DECIMAL(12,2) NOT NULL,
  status      ENUM('pending','settled','failed','refunded') NOT NULL DEFAULT 'pending',
  paid_at     DATETIME(3) NULL,
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_pay_order (order_id),
  UNIQUE KEY uq_pay_gateway (gateway_ref),
  CONSTRAINT chk_pay_amount CHECK (amount >= 0),
  CONSTRAINT fk_pay_order FOREIGN KEY (order_id) REFERENCES orders(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS audit_logs (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  actor_id   CHAR(36) NULL,
  action     VARCHAR(50) NOT NULL,
  entity     VARCHAR(50) NULL,
  entity_id  VARCHAR(64) NULL,
  old_value  JSON NULL,
  new_value  JSON NULL,
  ip_address VARCHAR(45) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  prev_hash  CHAR(64) NOT NULL DEFAULT '',
  row_hash   CHAR(64) NOT NULL DEFAULT '',
  KEY idx_audit_actor (actor_id),
  KEY idx_audit_created (created_at),
  CONSTRAINT fk_audit_actor FOREIGN KEY (actor_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS audit_chain_head (
  id        TINYINT UNSIGNED NOT NULL PRIMARY KEY,
  last_hash CHAR(64) NOT NULL
) ENGINE=InnoDB;

INSERT IGNORE INTO audit_chain_head (id, last_hash) VALUES (1, REPEAT('0', 64));
