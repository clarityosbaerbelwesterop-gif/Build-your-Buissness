import { motion } from "framer-motion";
import { useMemo } from "react";

export function StreamingText({ text }: { text: string }) {
  const words = useMemo(() => text.split(/(\s+)/), [text]);
  return (
    <p style={{ display: "inline" }}>
      {words.map((w, i) => (
        <motion.span
          key={`${i}-${text.length}`}
          initial={{ opacity: 0, y: 2 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.15, delay: Math.min(i * 0.015, 0.6) }}
        >
          {w}
        </motion.span>
      ))}
    </p>
  );
}
