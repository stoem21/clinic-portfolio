import { randomInt } from 'node:crypto';
import { Prisma } from '@prisma/client';
const pick = <T>(values: T[]): T => values[randomInt(values.length)];
const options: { type: string; data: Prisma.InputJsonObject; min: number; max: number }[] = [
  { type: 'scaling', data: { area: ['top', 'bottom'] }, min: 600, max: 1200 },
  { type: 'filling', data: { otherText: 'อุดฟันสาธิต 16(O)' }, min: 800, max: 1800 },
  { type: 'extraction', data: { tooth: ['18'] }, min: 700, max: 1500 },
  { type: 'fluoride', data: { otherText: 'เคลือบฟลูออไรด์สาธิต' }, min: 300, max: 700 },
  { type: 'bleaching', data: { otherText: 'ฟอกสีฟันสาธิต' }, min: 2500, max: 4500 },
  { type: 'others', data: { otherText: 'ตรวจและให้คำปรึกษาสุขภาพช่องปาก' }, min: 200, max: 600 },
];
export function randomDemoTreatment() {
  const option = pick(options);
  return { type: option.type, data: option.data,
    amount: randomInt(option.min / 100, option.max / 100 + 1) * 100,
    paymentType: pick(['cash', 'transfer']),
  };
}
export function randomDemoPatient() {
  const female = randomInt(2) === 1;
  return {
    nameTitle: female ? 'นางสาว' : 'นาย', gender: female ? 'หญิง' : 'ชาย',
    firstName: pick(female
      ? ['กมลชนก', 'พิมพ์ชนก', 'สุภาวดี', 'อรทัย', 'ศิริพร', 'ชลธิชา', 'นภัสสร', 'ปิยธิดา']
      : ['ธนภัทร', 'กิตติพงศ์', 'ณัฐวุฒิ', 'ธนกร', 'วิชัย', 'อนุชา', 'พงศกร', 'วรพล']),
    lastName: pick(['ใจดี', 'สุขสวัสดิ์', 'แสงทอง', 'บุญเจริญ', 'ศรีสกุล', 'มงคลชัย', 'เจริญสุข', 'รัตนชัย']),
    birthday: new Date(Date.UTC(randomInt(1965, 2006), randomInt(12), randomInt(1, 29))),
  };
}
