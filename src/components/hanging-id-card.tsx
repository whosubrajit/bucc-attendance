"use client";

import { motion } from "framer-motion";
import { ShieldCheck, User } from "lucide-react";

export function HangingIdCard({ member }: { member?: { name: string; department: string; designation?: string; profilePhotoUrl?: string | null } | null }) {
  return (
    <div className="absolute top-0 left-1/2 -translate-x-1/2 z-50 origin-top flex flex-col items-center pointer-events-none">
      {/* The Lanyard (Band) */}
      <div className="w-3 h-24 bg-gradient-to-b from-navy-950 via-electric-600 to-electric-500 shadow-lg relative z-0">
        <div className="absolute inset-0 bg-black/10 mix-blend-overlay"></div>
      </div>
      
      {/* The Card Clip */}
      <div className="w-6 h-8 bg-gradient-to-b from-gray-300 to-gray-400 rounded-t-md border-x border-t border-gray-500 shadow-inner z-10 -mt-2 flex items-center justify-center">
        <div className="w-2 h-2 rounded-full bg-gray-600 shadow-inner"></div>
      </div>

      {/* The Card */}
      <motion.div
        className="pointer-events-auto cursor-grab active:cursor-grabbing origin-top z-20 -mt-1"
        animate={{ rotate: [-3, 3, -3] }}
        transition={{
          repeat: Infinity,
          duration: 5,
          ease: "easeInOut",
        }}
        drag
        dragConstraints={{ top: 0, left: 0, right: 0, bottom: 0 }}
        dragElastic={0.15}
        whileHover={{ scale: 1.02 }}
        whileDrag={{ scale: 1.05, rotate: 0 }}
      >
        <div className="relative w-56 h-[340px] rounded-2xl bg-white/[0.03] backdrop-blur-md border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.5)] p-1 overflow-hidden group">
          {/* Inner border/gradient */}
          <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent rounded-2xl pointer-events-none"></div>
          
          {/* Card Content Container */}
          <div className="relative w-full h-full bg-navy-950/40 rounded-xl border border-white/5 flex flex-col items-center p-5">
            {/* Punch hole */}
            <div className="w-10 h-2 rounded-full bg-navy-950/80 border border-white/10 shadow-inner mb-6"></div>
            
            {/* Header Logo */}
            <div className="w-full flex justify-center mb-4 px-2">
              <img src="/bucc-logo.png" alt="BUCC Logo" className="h-12 w-auto object-contain opacity-90 drop-shadow-md" />
            </div>

            {/* Photo placeholder */}
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-electric-500/20 to-purple-500/20 border-2 border-white/10 flex items-center justify-center shadow-lg relative overflow-hidden mb-4 group-hover:border-electric-400/50 transition-colors duration-500">
              {member?.profilePhotoUrl ? (
                <img src={member.profilePhotoUrl} alt={member.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <User className="w-10 h-10 text-white/50" />
              )}
            </div>

            {/* Details */}
            <div className="text-center w-full space-y-1 mb-6">
              <h3 className="text-white font-bold text-lg leading-tight truncate px-2">
                {member ? member.name : "Guest User"}
              </h3>
              <p className="text-electric-300 text-xs font-medium uppercase tracking-wider">
                {member ? member.department : "BRAC University"}
              </p>
            </div>

            {/* Fake Barcode/QR */}
            <div className="mt-auto w-full h-12 bg-white/5 rounded flex items-center justify-center border border-white/10 overflow-hidden relative">
               <div className="w-full h-full opacity-30 flex items-center justify-between px-2">
                 {[...Array(20)].map((_, i) => (
                   <div key={i} className={`h-full bg-white ${i % 3 === 0 ? 'w-1' : i % 2 === 0 ? 'w-0.5' : 'w-1.5'}`}></div>
                 ))}
               </div>
            </div>
            <div className="w-full text-center mt-2">
              <span className="text-[8px] text-white/30 tracking-widest font-mono">
                {member ? member.designation?.toUpperCase() || "MEMBER" : "NOT-REGISTERED"}
              </span>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
