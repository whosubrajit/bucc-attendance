import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const email = 'dibyosingho.barua.subrajit@g.bracu.ac.bd';
  
  // Update CentralMember
  await prisma.centralMember.update({
    where: { email },
    data: {
      department: 'Governing Body',
      designation: 'President',
    }
  }).catch(() => console.log('CentralMember not found or already updated'));

  // Update Member (if they already logged in)
  await prisma.member.update({
    where: { email },
    data: {
      department: 'Governing Body',
      designation: 'President',
      role: 'GB',
    }
  }).catch(() => console.log('Member not found (they havent logged in yet)'));

  console.log("Admin access granted to " + email);
}

main().catch(console.error).finally(() => prisma.$disconnect());
