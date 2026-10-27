const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
const dictionary = {"James": "สมชาย", "Michael": "วิชัย", "Robert": "ประเสริฐ", "David": "ธนกร", "Daniel": "กิตติ", "Kevin": "ณัฐวุฒิ", "Andrew": "อนุชา", "Matthew": "ธีรภัทร", "Christopher": "พงศกร", "Joseph": "วรพล", "Sarah": "สุภาวดี", "Emily": "อรทัย", "Jessica": "ศิริพร", "Amanda": "กมลชนก", "Jennifer": "วรัญญา", "Lisa": "ปิยธิดา", "Michelle": "นภัสสร", "Karen": "ชลธิชา", "Laura": "รัตนา", "Emma": "พิมพ์ชนก", "Smith": "ใจดี", "Johnson": "สุขสวัสดิ์", "Williams": "ศรีสกุล", "Brown": "ทองดี", "Jones": "บุญมี", "Garcia": "วัฒนากุล", "Miller": "เจริญสุข", "Davis": "แสงทอง", "Wilson": "รุ่งเรือง", "Anderson": "มงคลชัย", "Chen": "ธนากุล", "Reed": "พัฒนชัย", "Tan": "ศิริกุล", "Park": "ปัญญาดี", "Lewis": "สุขใจ", "Cruz": "รัตนชัย", "Ford": "บุญเจริญ", "Ortiz": "ชูศรี", "Bennett": "แซ่ลิ้ม", "Si Lom": "สีลม", "Bang Rak": "บางรัก", "Bangkok": "กรุงเทพมหานคร", "Su Thep": "สุเทพ", "Mueang Chiang Mai": "เมืองเชียงใหม่", "Chiang Mai": "เชียงใหม่", "Hat Yai": "หาดใหญ่", "Songkhla": "สงขลา", "Nai Mueang": "ในเมือง", "Mueang Nakhon Ratchasima": "เมืองนครราชสีมา", "Nakhon Ratchasima": "นครราชสีมา", "Talat Yai": "ตลาดใหญ่", "Mueang Phuket": "เมืองภูเก็ต", "Phuket": "ภูเก็ต", "Nong Prue": "หนองปรือ", "Bang Lamung": "บางละมุง", "Chon Buri": "ชลบุรี", "Diabetes": "เบาหวาน", "Hypertension": "ความดันโลหิตสูง", "Heart Disease": "โรคหัวใจ", "Asthma": "หอบหืด", "Penicillin": "เพนิซิลลิน", "Aspirin": "แอสไพริน", "Ibuprofen": "ไอบูโพรเฟน", "Follow-up scheduled": "นัดติดตามอาการแล้ว", "Patient cooperative": "ผู้ป่วยให้ความร่วมมือดี", "Oral hygiene advice given": "ให้คำแนะนำการดูแลช่องปากแล้ว", "Dental checkup": "ตรวจสุขภาพฟัน", "Consultation": "ปรึกษาทันตแพทย์", "Suture removal": "ตัดไหม", "bone graft": "ปลูกกระดูก", "in-office bleaching": "ฟอกสีฟันที่คลินิก", "topical fluoride application": "เคลือบฟลูออไรด์", "Dental treatment": "ค่ารักษาทางทันตกรรม", "Walk-in Patient": "ผู้ป่วยทั่วไป", "Social Security Office": "สำนักงานประกันสังคม", "Dr. ": "ทพ. "};
const entries = Object.entries(dictionary).sort((a,b) => b[0].length-a[0].length);
function translate(value) {
 if (typeof value === 'string') {
   for (const [en, th] of entries) value = value.split(en).join(th);
   return value;
 }
 if (Array.isArray(value)) return value.map(translate);
 if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,translate(v)]));
 return value;
}
async function main() {
 const target = new URL(process.env.DATABASE_URL || '');
 if (process.env.DEMO_MODE !== 'true' || target.hostname !== 'clinic-db' || target.pathname !== '/clinic_demo') throw Error('Only isolated demo database allowed');
 await db.$transaction(async tx => {
   if (!await tx.auditLog.findUnique({where:{id:'portfolio-demo-initialized-v1'}})) throw Error('Missing demo marker');
   if (await tx.auditLog.findUnique({where:{id:'portfolio-demo-thai-v1'}})) return;
   // Translate free text only. IDs, enums, dates, amounts and links remain intact.
   const models = {
     client:['firstName','lastName','addressSubDistrict','addressDistrict','addressProvince','addressDetail','medCon','drugAllergy','drugEat'],
     dentist:['name','note'], treatmentRecord:['note'], treatmentItem:['data'],
     receipt:['customerName','customerAddress','lineItems'], labWork:['typeDescription'],
     opsAppointment:['provisionalName','notes'], auditLog:['summary']
   };
   for (const [model, fields] of Object.entries(models)) {
     const rows = await tx[model].findMany();
     for (const row of rows) {
       const data = {};
       for (const field of fields) {
         if (row[field] == null) continue;
         const changed = translate(row[field]);
         if (JSON.stringify(changed) !== JSON.stringify(row[field])) data[field] = changed;
       }
       if(Object.keys(data).length) await tx[model].update({where:{id:row.id},data});
     }
   }
   await tx.auditLog.create({data:{id:'portfolio-demo-thai-v1',actorUsername:'demo',action:'update',entity:'portfolio-demo',entityId:'portfolio-demo-thai-v1',summary:'แปลงข้อมูลสมมติเป็นภาษาไทย โดยคงรหัสและรายการเดิม'}});
 },{timeout:60000});
 console.log('Thai fictional demo data ready.');
}
main().catch(e=>{console.error(e.message);process.exitCode=1}).finally(()=>db.$disconnect());
