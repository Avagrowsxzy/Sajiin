#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

echo "=========================================================="
echo "         FoodOrder - Inisialisasi Database Lokal          "
echo "=========================================================="

# 1. Tanya password root jika belum disediakan via argumen atau env
ROOT_PASSWORD="${1:-${MYSQL_ROOT_PASSWORD:-}}"

if [ -z "${ROOT_PASSWORD}" ]; then
  if [ -t 0 ]; then
    read -rsp "Masukkan password root MySQL/MariaDB: " ROOT_PASSWORD
    echo ""
  else
    echo "ERROR: Password root tidak disediakan. Jalankan secara interaktif atau set MYSQL_ROOT_PASSWORD." >&2
    exit 1
  fi
fi

# Tentukan binary client: mariadb atau mysql
if command -v mariadb &>/dev/null; then
  DB_CLI="mariadb"
elif command -v mysql &>/dev/null; then
  DB_CLI="mysql"
else
  echo "ERROR: Client mysql atau mariadb tidak ditemukan di PATH." >&2
  exit 1
fi

echo "[1/6] Menguji koneksi root MySQL/MariaDB..."
if ! "${DB_CLI}" -u root -p"${ROOT_PASSWORD}" -e "SELECT 1;" &>/dev/null; then
  echo "ERROR: Gagal login sebagai root. Password salah atau server tidak merespons." >&2
  exit 1
fi
echo "  Koneksi root berhasil."

# Deteksi port server database aktif
DB_DETECTED_PORT=$("${DB_CLI}" -u root -p"${ROOT_PASSWORD}" -N -e "SELECT @@port;" 2>/dev/null | tr -d '[:space:]' || echo "3306")
if [ -z "${DB_DETECTED_PORT}" ]; then
  DB_DETECTED_PORT="3306"
fi
echo "  Port basis data terdeteksi: ${DB_DETECTED_PORT}"

# 2. Buat password acak (32 karakter hex)
echo "[2/6] Membuat kredensial acak untuk akun basis data..."
MIGRATOR_PASS=$(openssl rand -hex 16)
APP_PASS=$(openssl rand -hex 16)
AUDIT_PASS=$(openssl rand -hex 16)
ADMIN_PASS=$(openssl rand -base64 18 | tr -dc 'A-Za-z0-9!@#$%^&*' | head -c 16)
JWT_SECRET=$(openssl rand -hex 32)
FIELD_KEY=$(openssl rand -hex 32)

# 3. Eksekusi pembuatan basis data dan akun DB dengan akun root
echo "[3/6] Membuat basis data 'foodorder' dan akun (migrator, app_rw, audit_ro)..."
"${DB_CLI}" -u root -p"${ROOT_PASSWORD}" <<EOSQL
CREATE DATABASE IF NOT EXISTS foodorder CHARACTER SET utf8mb4;

-- Akun migrator
CREATE USER IF NOT EXISTS 'migrator'@'localhost' IDENTIFIED BY '${MIGRATOR_PASS}';
ALTER USER 'migrator'@'localhost' IDENTIFIED BY '${MIGRATOR_PASS}';
CREATE USER IF NOT EXISTS 'migrator'@'127.0.0.1' IDENTIFIED BY '${MIGRATOR_PASS}';
ALTER USER 'migrator'@'127.0.0.1' IDENTIFIED BY '${MIGRATOR_PASS}';

-- Akun app_rw
CREATE USER IF NOT EXISTS 'app_rw'@'localhost' IDENTIFIED BY '${APP_PASS}';
ALTER USER 'app_rw'@'localhost' IDENTIFIED BY '${APP_PASS}';
CREATE USER IF NOT EXISTS 'app_rw'@'127.0.0.1' IDENTIFIED BY '${APP_PASS}';
ALTER USER 'app_rw'@'127.0.0.1' IDENTIFIED BY '${APP_PASS}';

-- Akun audit_ro
CREATE USER IF NOT EXISTS 'audit_ro'@'localhost' IDENTIFIED BY '${AUDIT_PASS}';
ALTER USER 'audit_ro'@'localhost' IDENTIFIED BY '${AUDIT_PASS}';
CREATE USER IF NOT EXISTS 'audit_ro'@'127.0.0.1' IDENTIFIED BY '${AUDIT_PASS}';
ALTER USER 'audit_ro'@'127.0.0.1' IDENTIFIED BY '${AUDIT_PASS}';

-- Berikan ALL PRIVILEGES WITH GRANT OPTION pada foodorder kepada migrator agar migrator bisa menjalankan migrasi dan GRANT
GRANT ALL PRIVILEGES ON foodorder.* TO 'migrator'@'localhost' WITH GRANT OPTION;
GRANT ALL PRIVILEGES ON foodorder.* TO 'migrator'@'127.0.0.1' WITH GRANT OPTION;
FLUSH PRIVILEGES;
EOSQL
echo "  Basis data dan akun pengguna berhasil dibuat."

# 4. Tulis ke .env dan pastikan aman di .gitignore
echo "[4/6] Menulis konfigurasi ke .env..."
ENV_FILE="${PROJECT_ROOT}/.env"

# Cek .gitignore
if ! grep -q "^\.env$" "${PROJECT_ROOT}/.gitignore" 2>/dev/null; then
  echo ".env" >> "${PROJECT_ROOT}/.gitignore"
fi

cat > "${ENV_FILE}" <<EOF
# === Database ===
DB_HOST=127.0.0.1
DB_PORT=${DB_DETECTED_PORT}
DB_NAME=foodorder
DB_MIGRATOR_USER=migrator
DB_MIGRATOR_PASSWORD=${MIGRATOR_PASS}
DB_APP_USER=app_rw
DB_APP_PASSWORD=${APP_PASS}
DB_AUDIT_USER=audit_ro
DB_AUDIT_PASSWORD=${AUDIT_PASS}

# === SSL/TLS Koneksi Database ===
# Aktifkan (true) hanya setelah sertifikat SSL server dipasang dan user app_rw diwajibkan SSL.
DB_SSL=false
DB_SSL_CA=

# === Admin Seed ===
ADMIN_SEED_EMAIL=admin@foodorder.local
ADMIN_SEED_PASSWORD=${ADMIN_PASS}

# === JWT ===
JWT_SECRET=${JWT_SECRET}
JWT_ACCESS_EXPIRES=15m
JWT_REFRESH_EXPIRES=7d

# === Enkripsi Kolom (AES-256-GCM) ===
FIELD_ENCRYPTION_KEY=${FIELD_KEY}

# === Server ===
PORT=3000
NODE_ENV=development

# === Frontend URL (CORS) ===
FRONTEND_URL=http://localhost:5173
EOF

chmod 600 "${ENV_FILE}"
echo "  File .env berhasil ditulis (izin 600) dan terdaftar di .gitignore."

# 5. Jalankan migrasi dan seed menggunakan akun migrator
echo "[5/6] Menjalankan migrasi DDL, trigger, view, dan seed..."
(
  cd "${PROJECT_ROOT}/backend"
  npx ts-node --esm scripts/migrate.ts
  npx ts-node --esm scripts/seed.ts
)

# 6. Jalankan tes verifikasi keamanan DB
echo "[6/6] Menjalankan tes verifikasi keamanan basis data..."
(
  cd "${PROJECT_ROOT}/backend"
  npx ts-node --esm scripts/verify-db-security.ts
)

echo "=========================================================="
echo "       Setup Basis Data FoodOrder Selesai & Teruji!       "
echo "=========================================================="
echo "Akun admin awal: admin@foodorder.local"
echo "Password tersimpan di .env (wajib segera diubah saat login pertama)."
