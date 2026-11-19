import { useEffect, useRef } from 'react';
import { AnimatePresence, motion, useMotionValue, useTransform } from 'framer-motion';
import { useAuthFlow } from '../../hooks/useAuthFlow';
import { AuthFlowContent } from './AuthFlowContent';
import { X } from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  initialMode?: 'login';
  onClose: () => void;
}

export function AuthModal({ isOpen, initialMode = 'login', onClose }: AuthModalProps) {
  const flow = useAuthFlow({ onSuccess: onClose, portal: 'customer' });
  const { loading, setMode, reset } = flow;

  const cardRef = useRef<HTMLDivElement>(null);
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const rotateX = useTransform(mouseY, [-300, 300], [5, -5]);
  const rotateY = useTransform(mouseX, [-300, 300], [-5, 5]);

  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      reset();
    }
  }, [initialMode, isOpen, setMode, reset]);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerMove = (event: PointerEvent) => {
      const card = cardRef.current;
      if (!card || event.pointerType === 'touch') return;

      const rect = card.getBoundingClientRect();
      const x = Math.max(-300, Math.min(300, event.clientX - rect.left - rect.width / 2));
      const y = Math.max(-300, Math.min(300, event.clientY - rect.top - rect.height / 2));
      mouseX.set(x);
      mouseY.set(y);
    };

    const resetPointer = () => {
      mouseX.set(0);
      mouseY.set(0);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('blur', resetPointer);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('blur', resetPointer);
    };
  }, [isOpen, mouseX, mouseY]);

  const close = () => {
    if (loading) return;
    reset();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="auth-modal-overlay" onMouseDown={close}>
        <motion.div
          className="auth-modal-card"
          ref={cardRef}
          initial={{ opacity: 0, scale: 0.94, y: 18 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 18 }}
          transition={{ type: 'spring', stiffness: 260, damping: 24 }}
          style={{ rotateX, rotateY, transformPerspective: 1200, maxHeight: '90vh', overflowY: 'auto' }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <button className="auth-modal-close" onClick={close} aria-label="Tutup"><X size={18} /></button>
          <AuthFlowContent flow={flow} variant="customer" />
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
