export const toothList = [
  "11","12","13","14","15","16","17","18",
  "21","22","23","24","25","26","27","28",
  "31","32","33","34","35","36","37","38",
  "41","42","43","44","45","46","47","48",
];

export const pediatricsToothList = [
  "51","52","53","54","55",
  "61","62","63","64","65",
  "71","72","73","74","75",
  "81","82","83","84","85",
];

export const toothSideOptions: { value: string; label: string; forTeeth: string[] | 'all' }[] = [
  { value: "m",  label: "M",  forTeeth: "all" },
  { value: "z",  label: "Z",  forTeeth: ["11","12","13","21","22","23","31","32","33","41","42","43"] },
  { value: "o",  label: "O",  forTeeth: ["14","15","16","17","18","24","25","26","27","28","34","35","36","37","38","44","45","46","47","48"] },
  { value: "d",  label: "D",  forTeeth: "all" },
  { value: "b",  label: "B",  forTeeth: ["14","15","16","17","18","24","25","26","27","28","34","35","36","37","38","44","45","46","47","48"] },
  { value: "li", label: "Li", forTeeth: ["31","32","33","41","42","43","34","35","36","37","38","44","45","46","47","48"] },
  { value: "la", label: "La", forTeeth: ["11","12","13","21","22","23","31","32","33","41","42","43"] },
  { value: "pa", label: "Pa", forTeeth: ["11","12","13","21","22","23","14","15","16","17","18","24","25","26","27","28"] },
];

// `text` holds an i18n key (resolved by `typeText` in TreatmentItemSummary.tsx),
// not literal text, so it follows the active UI language.
export const treatmentTypes = [
  { text: "treatmentItems:treatmentType.extraction",     value: "extraction" },
  { text: "treatmentItems:treatmentType.surgicalRemoval", value: "surgicalRemoval" },
  { text: "treatmentItems:treatmentType.scaling",         value: "scaling" },
  { text: "treatmentItems:treatmentType.rootPlaning",     value: "rootPlaning" },
  { text: "treatmentItems:treatmentType.filling",         value: "filling" },
  { text: "treatmentItems:treatmentType.rootCanalTreatment", value: "rootCanalTreatment" },
  { text: "treatmentItems:treatmentType.removableDentures", value: "removableDentures" },
  { text: "treatmentItems:treatmentType.post",            value: "post" },
  { text: "treatmentItems:treatmentType.crown",           value: "crown" },
  { text: "treatmentItems:treatmentType.implant",         value: "implant" },
  { text: "treatmentItems:treatmentType.ortho",           value: "ortho" },
  { text: "treatmentItems:treatmentType.bleaching",       value: "bleaching" },
  { text: "treatmentItems:treatmentType.fluoride",        value: "fluoride" },
  { text: "treatmentItems:treatmentType.xRay",            value: "xRay" },
  { text: "treatmentItems:treatmentType.pediatrics",      value: "pediatrics" },
  { text: "treatmentItems:treatmentType.supply",          value: "supply" },
  { text: "treatmentItems:treatmentType.others",          value: "others" },
];
