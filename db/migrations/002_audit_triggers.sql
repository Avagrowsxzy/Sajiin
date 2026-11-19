-- Migration 002: Audit Triggers
-- Append-only enforcement and SHA2-256 hash chaining

DROP TRIGGER IF EXISTS trg_audit_chain;
DROP TRIGGER IF EXISTS trg_audit_no_update;
DROP TRIGGER IF EXISTS trg_audit_no_delete;

DELIMITER $$

CREATE TRIGGER trg_audit_chain BEFORE INSERT ON audit_logs
FOR EACH ROW
BEGIN
  DECLARE v_prev CHAR(64);
  SELECT last_hash INTO v_prev FROM audit_chain_head WHERE id = 1 FOR UPDATE;
  SET NEW.created_at = NOW(3);
  SET NEW.prev_hash  = v_prev;
  SET NEW.row_hash   = SHA2(CONCAT_WS('|',
        NEW.prev_hash,
        IFNULL(NEW.actor_id, ''),
        NEW.action,
        IFNULL(NEW.entity, ''),
        IFNULL(NEW.entity_id, ''),
        IFNULL(CAST(NEW.old_value AS CHAR), ''),
        IFNULL(CAST(NEW.new_value AS CHAR), ''),
        IFNULL(NEW.ip_address, ''),
        DATE_FORMAT(NEW.created_at, '%Y-%m-%d %H:%i:%s.%f')
      ), 256);
  UPDATE audit_chain_head SET last_hash = NEW.row_hash WHERE id = 1;
END$$

CREATE TRIGGER trg_audit_no_update BEFORE UPDATE ON audit_logs
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'audit_logs bersifat append-only';
END$$

CREATE TRIGGER trg_audit_no_delete BEFORE DELETE ON audit_logs
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'audit_logs bersifat append-only';
END$$

DELIMITER ;
