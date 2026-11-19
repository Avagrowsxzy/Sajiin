ALTER TABLE orders DROP FOREIGN KEY fk_order_addr;
ALTER TABLE orders DROP COLUMN address_id;
DROP TABLE IF EXISTS addresses;
