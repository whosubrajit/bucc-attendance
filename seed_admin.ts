import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  await prisma.centralMember.upsert({
    where: { email: 'subraajit@gmail.com' },
    update: {
      name: 'Subrajit (Admin)',
      department: 'Governing Body',
      designation: 'President',
      isActive: true,
    },
    create: {
      studentId: '00000000',
      email: 'subraajit@gmail.com',
      name: 'Subrajit (Admin)',
      department: 'Governing Body',
      designation: 'President',
      isActive: true,
    }
  });
  console.log("Admin seeded!");
}
main().catch(console.error).finally(() => prisma.$disconnect());
