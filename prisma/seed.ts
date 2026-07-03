import { PrismaClient } from "@prisma/client";
import xlsx from "xlsx";
import path from "path";

const prisma = new PrismaClient();

async function main() {
  const filePath = path.join(process.cwd(), "All_Department_Members_Spring26.xlsx");
  const workbook = xlsx.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  
  // Headers are: 'Student Id', 'Name', 'Department', 'Designation', 'Phone Number', 'G-Suite'
  const rows = xlsx.utils.sheet_to_json(sheet, { defval: "" });

  console.log(`Found ${rows.length} rows in the Excel file. Seeding CentralMember...`);

  let count = 0;
  for (const row of rows as any[]) {
    const email = row["G-Suite"]?.toString().trim().toLowerCase();
    const studentId = row["Student Id"]?.toString().trim();
    const name = row["Name"]?.toString().trim();
    const department = row["Department"]?.toString().trim();
    const designation = row["Designation"]?.toString().trim();

    if (!email || !studentId || !name) {
      continue;
    }

    await prisma.centralMember.upsert({
      where: { email },
      update: {
        name,
        studentId,
        department: department || "Unknown",
        designation: designation || "Executive",
        isActive: true,
      },
      create: {
        email,
        name,
        studentId,
        department: department || "Unknown",
        designation: designation || "Executive",
        isActive: true,
      },
    });
    count++;
  }

  console.log(`Successfully seeded ${count} executives/members into CentralMember table.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
