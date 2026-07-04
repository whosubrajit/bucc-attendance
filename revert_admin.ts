import { PrismaClient } from '@prisma/client';
import { deriveRole } from './src/lib/central-db';
const prisma = new PrismaClient();

async function main() {
  const email = 'dibyosingho.barua.subrajit@g.bracu.ac.bd';
  const department = 'Human Resources';
  const designation = 'Senior Executive';
  
  // Note: deriveRole now returns 'GB' for this email
  const role = deriveRole(department, designation, email);

  // Update CentralMember
  await prisma.centralMember.update({
    where: { email },
    data: { department, designation }
  }).catch(() => console.log('CentralMember not found'));

  // Update Member
  await prisma.member.update({
    where: { email },
    data: { department, designation, role }
  }).catch(() => console.log('Member not found'));

  console.log("Reverted title to HR SE, but kept admin role:", role);
}

main().catch(console.error).finally(() => prisma.$disconnect());
