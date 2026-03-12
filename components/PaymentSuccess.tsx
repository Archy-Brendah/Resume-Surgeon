"use client";

import { motion, AnimatePresence } from "framer-motion";

type PaymentSuccessProps = {
  open: boolean;
  onClose: () => void;
  /** New credit balance to show (optional). When provided, displayed under "Credit Balance" in York Gold. */
  creditBalance?: number;
};

/** High-end SVG checkmark with stroke-dasharray draw-in animation */
function SuccessCheckmark() {
  return (
    <motion.svg
      viewBox="0 0 80 80"
      className="h-20 w-20 shrink-0 mx-auto"
      initial="hidden"
      animate="visible"
      variants={{
        hidden: { opacity: 0, scale: 0.8 },
        visible: {
          opacity: 1,
          scale: 1,
          transition: { duration: 0.35, ease: "easeOut" },
        },
      }}
    >
      <defs>
        <linearGradient id="check-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#10b981" />
          <stop offset="100%" stopColor="#059669" />
        </linearGradient>
      </defs>
      <motion.circle
        cx="40"
        cy="40"
        r="36"
        fill="none"
        stroke="url(#check-gradient)"
        strokeWidth="2.5"
        strokeOpacity="0.25"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.1 }}
      />
      <motion.path
        d="M22 40 L34 52 L58 26"
        fill="none"
        stroke="url(#check-gradient)"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.45, delay: 0.2, ease: "easeOut" }}
      />
    </motion.svg>
  );
}

export function PaymentSuccess({ open, onClose, creditBalance }: PaymentSuccessProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4"
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-labelledby="payment-success-title"
        >
          <motion.div
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ type: "spring", damping: 26, stiffness: 300 }}
            className="relative w-full max-w-sm rounded-2xl border border-slate-200/80 bg-white p-8 shadow-[0_24px_80px_-12px_rgba(15,23,42,0.25)]"
            onClick={(e) => e.stopPropagation()}
          >
            <SuccessCheckmark />
            <h2
              id="payment-success-title"
              className="mt-6 text-center text-lg font-semibold text-slate-900"
            >
              Payment Verified
            </h2>
            <p className="mt-2 text-center text-sm text-slate-600">
              Your Surgical Credits have been added.
            </p>
            <p className="mt-4 text-center">
              <span className="text-xs font-medium uppercase tracking-wider text-[#F59E0B]">
                Credit Balance
              </span>
              <span className="ml-2 text-xl font-bold text-[#F59E0B]">
                {creditBalance != null ? `${creditBalance.toLocaleString()} SU` : "Updated"}
              </span>
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-6 w-full rounded-xl bg-gradient-to-b from-[#064E3B] to-[#10B981] px-4 py-3.5 text-base font-semibold text-white shadow-lg shadow-emerald-900/20 transition-all hover:shadow-xl hover:shadow-emerald-900/25 active:scale-[0.99]"
            >
              Continue to Dashboard
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
