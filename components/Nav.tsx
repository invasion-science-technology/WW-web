"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";

export default function Nav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <motion.nav
      initial={{ y: -16, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-[#080c08]/90 backdrop-blur-md border-b border-[#1e2a1e]"
          : "bg-transparent"
      }`}
    >
      <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[#86efac] font-semibold text-lg tracking-tight">
            WeedWatch
            <span className="text-[#f0faf0]"> AI</span>
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/prototype"
            className="text-sm text-[#8aab8a] hover:text-[#86efac] transition-colors hidden sm:inline"
          >
            Field lab
          </Link>
          <a
            href="mailto:hello@weedwatch.ai"
            className="text-sm font-medium px-4 py-2 rounded-full border border-[#86efac]/40 text-[#86efac] hover:bg-[#86efac]/10 transition-colors duration-200"
          >
            Request Early Access
          </a>
        </div>
      </div>
    </motion.nav>
  );
}
