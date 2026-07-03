import { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { lookupCentralMember, deriveRole } from "@/lib/central-db";
import { prisma } from "@/lib/prisma";

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      if (!user.email) return false;
      const domain = process.env.ALLOWED_EMAIL_DOMAIN;
      if (domain && !user.email.endsWith(`@${domain}`) && user.email !== "subraajit@gmail.com") {
        return false;
      }
      
      const centralMember = await lookupCentralMember(user.email);
      if (!centralMember || !centralMember.isActive) {
        return false; // Only active central members can log in
      }

      // Upsert local member profile
      await prisma.member.upsert({
        where: { email: centralMember.email },
        update: {
          name: centralMember.name,
          studentId: centralMember.studentId,
          department: centralMember.department,
          designation: centralMember.designation,
          role: deriveRole(centralMember.department, centralMember.designation),
          isActive: centralMember.isActive,
          profilePhotoUrl: user.image || null,
        },
        create: {
          email: centralMember.email,
          name: centralMember.name,
          studentId: centralMember.studentId,
          department: centralMember.department,
          designation: centralMember.designation,
          role: deriveRole(centralMember.department, centralMember.designation),
          isActive: centralMember.isActive,
          profilePhotoUrl: user.image || null,
        },
      });

      return true;
    },
    async jwt({ token, user }) {
      if (user?.email) {
        const member = await prisma.member.findUnique({ where: { email: user.email } });
        if (member) {
          token.memberId = member.id;
          token.role = member.role;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.memberId) {
        session.user.memberId = token.memberId as string;
        session.user.role = token.role as string;
      }
      return session;
    },
  },
};
