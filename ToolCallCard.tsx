<motion.div
  initial={{ height: 40 }}
  animate={{ height: open ? "auto" : 40 }}
  transition={{ type: "spring", stiffness: 300, damping: 28 }}
  style={{ overflow: "hidden" }}
/>
