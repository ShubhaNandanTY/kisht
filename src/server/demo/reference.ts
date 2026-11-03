// Synthetic reference data for the demo. Every name, phone number and address here is invented.
// Branches, pincodes and team sizes are assumptions (the brief gives only "Indore", 55 officers).

export const BRANCHES = [
  { id: "SYG", name: "Siyaganj", nameHi: "सियागंज", phone: "0731-4000001" },
  { id: "SNR", name: "Sanwer Road", nameHi: "सांवेर रोड", phone: "0731-4000002" },
  { id: "PTM", name: "Pithampur", nameHi: "पीथमपुर", phone: "07292-400003" },
] as const;

export type BranchId = (typeof BRANCHES)[number]["id"];

export const PINCODES: Record<string, { branch: BranchId; area: string; lat: number; lng: number }> = {
  "452007": { branch: "SYG", area: "Siyaganj", lat: 22.7239, lng: 75.8665 },
  "452002": { branch: "SYG", area: "Rajwada", lat: 22.7186, lng: 75.8553 },
  "452004": { branch: "SYG", area: "Jawahar Marg", lat: 22.7121, lng: 75.8732 },
  "452015": { branch: "SNR", area: "Sanwer Road Industrial Area", lat: 22.7603, lng: 75.8571 },
  "452003": { branch: "SNR", area: "Polo Ground", lat: 22.7352, lng: 75.8448 },
  "452006": { branch: "SNR", area: "Laxmibai Nagar", lat: 22.7468, lng: 75.8402 },
  "454775": { branch: "PTM", area: "Pithampur Sector 1", lat: 22.6066, lng: 75.6868 },
  "454774": { branch: "PTM", area: "Pithampur Sector 3", lat: 22.6197, lng: 75.6611 },
  "454773": { branch: "PTM", area: "Sagore", lat: 22.5912, lng: 75.7035 },
};

export const OFFICERS = [
  { id: "u-rahul", name: "Rahul Chouhan", email: "rahul@kisht.demo", branch: "SNR", pincodes: ["452015", "452006"] },
  { id: "u-sunita", name: "Sunita Yadav", email: "sunita@kisht.demo", branch: "SNR", pincodes: ["452015", "452003"] },
  { id: "u-vikram", name: "Vikram Rathore", email: "vikram@kisht.demo", branch: "SNR", pincodes: ["452003", "452006"] },
  { id: "u-deepak", name: "Deepak Patidar", email: "deepak@kisht.demo", branch: "SNR", pincodes: ["452015"] },
  { id: "u-imran", name: "Imran Qureshi", email: "imran@kisht.demo", branch: "SYG", pincodes: ["452007", "452002"] },
  { id: "u-kavita", name: "Kavita Jain", email: "kavita@kisht.demo", branch: "SYG", pincodes: ["452002", "452004"] },
  { id: "u-mohit", name: "Mohit Sharma", email: "mohit@kisht.demo", branch: "SYG", pincodes: ["452004", "452007"] },
  { id: "u-farhan", name: "Farhan Sheikh", email: "farhan@kisht.demo", branch: "SYG", pincodes: ["452007"] },
  { id: "u-neha", name: "Neha Solanki", email: "neha@kisht.demo", branch: "PTM", pincodes: ["454775", "454773"] },
  { id: "u-ajay", name: "Ajay Thakur", email: "ajay@kisht.demo", branch: "PTM", pincodes: ["454775", "454774"] },
  { id: "u-ritu", name: "Ritu Chouhan", email: "ritu@kisht.demo", branch: "PTM", pincodes: ["454774", "454773"] },
  { id: "u-sanjay", name: "Sanjay Parmar", email: "sanjay@kisht.demo", branch: "PTM", pincodes: ["454775"] },
] as const;

export const MANAGERS = [
  { id: "u-anil", name: "Anil Mehta", email: "anil@kisht.demo", role: "manager", branch: "SYG" },
  { id: "u-priya", name: "Priya Saxena", email: "priya@kisht.demo", role: "manager", branch: "SNR" },
  { id: "u-rakesh", name: "Rakesh Dubey", email: "rakesh@kisht.demo", role: "manager", branch: "PTM" },
  { id: "u-meera", name: "Meera Joshi", email: "meera@kisht.demo", role: "head", branch: null },
] as const;

export const BUSINESS_TYPES: Record<BranchId, string[]> = {
  SYG: ["Kirana wholesaler", "Spice trader", "Textile trader", "Printing press", "Hardware store", "Electrical goods trader", "Dry fruit trader", "Utensils dealer"],
  SNR: ["Packaging unit", "Plastic moulding unit", "Steel fabrication", "Namkeen manufacturer", "Furniture workshop", "Auto parts workshop", "Garment stitching unit"],
  PTM: ["Fertiliser shop", "Auto parts supplier", "Engineering workshop", "Flour mill", "Tiles dealer", "Transport contractor", "Poha mill"],
};

const PREFIX = ["Malwa", "Narmada", "Shree Sai", "Ahilya", "Rajwada", "Maa Kalka", "Shiv Shakti", "Annapurna", "Jai Ambe", "Ujjwal", "Mahakal", "Kshipra", "Vindhya", "Om", "Navkar", "Gurukripa", "Sanskriti", "Prakash", "Lakshmi", "Saraswati", "Ganpati", "Bhagyoday", "Chambal", "Satpura", "Shubh", "Arihant", "Balaji", "Krishna", "Mangal", "Nandan"];
const SUFFIX: Record<string, string[]> = {
  default: ["Traders", "Enterprises", "Industries", "Udyog", "& Sons", "Agencies", "Brothers"],
};

export function businessName(prefix: number, type: string, suffix: number): string {
  const p = PREFIX[prefix % PREFIX.length];
  const shortType = type.split(" ")[0];
  const sfx = SUFFIX.default[suffix % SUFFIX.default.length];
  return suffix % 3 === 0 ? `${p} ${shortType} ${sfx}` : `${p} ${sfx}`;
}

export const DEMO_PASSWORD = "kisht-demo-2026";
