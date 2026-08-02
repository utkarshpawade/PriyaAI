import { projectSchema, type Project } from './schema.js';

/**
 * FICTIONAL PROJECT — demo data only.
 *
 * Every figure below is invented for this assignment. The RERA number follows
 * the Maharashtra format but is not a real registration, and no unit here can
 * be booked. The `IS_FICTIONAL` flag is threaded into the system prompt and the
 * dashboard so this can never be mistaken for live inventory.
 */
export const aurevaSkyline: Project = projectSchema.parse({
  IS_FICTIONAL: true,

  slug: 'aureva-skyline',
  name: 'Aureva Skyline',
  developer: 'Meridian Group',
  developerNote:
    'Fictional developer created for this demo. Positioned as a 20-year-old Pune builder with 14 delivered projects.',
  reraId: 'P52100099001 (FICTIONAL — placeholder, not a real RERA registration)',
  reraNote:
    'This is a placeholder in MahaRERA format for demo purposes only. Always direct a real buyer to maharera.mahaonline.gov.in to verify.',
  propertyType: 'apartment',
  positioning:
    'Mid-premium 1/2/3 BHK towers aimed at Hinjewadi IT professionals buying their first or second home.',

  location: {
    locality: 'Hinjewadi Phase 2',
    city: 'Pune',
    state: 'Maharashtra',
    pincode: '411057',
    latitude: 18.5913,
    longitude: 73.7389,
    aliases: ['hinjewadi', 'hinjawadi', 'hinjewadi phase 2', 'phase 2', 'rajiv gandhi infotech park'],
  },

  scale: {
    landAreaAcres: 6.8,
    towers: 4,
    floorsPerTower: 'G + 22 floors',
    totalUnits: 648,
    openSpacePercent: 72,
  },

  configurations: [
    {
      configuration: '1BHK',
      label: '1 BHK Compact',
      carpetAreaSqft: [452, 478],
      bathrooms: 1,
      balconies: 1,
      priceBandInr: [4_800_000, 5_400_000],
      floorPlanNote:
        'Single bedroom with an open kitchen and one attached balcony. Popular with investors renting to IT tenants.',
    },
    {
      configuration: '2BHK',
      label: '2 BHK',
      carpetAreaSqft: [715, 768],
      bathrooms: 2,
      balconies: 2,
      priceBandInr: [7_200_000, 8_600_000],
      floorPlanNote:
        'Two bedrooms, a separate utility, and a dry balcony. Larger variant adds a study nook off the living room.',
    },
    {
      configuration: '3BHK',
      label: '3 BHK',
      carpetAreaSqft: [942, 1_252],
      bathrooms: 3,
      balconies: 2,
      priceBandInr: [9_500_000, 14_500_000],
      floorPlanNote:
        'Three bedrooms with the master facing the central garden. The 1,252 sq ft variant is a corner unit with a wraparound deck.',
    },
  ],

  amenities: [
    '25-metre lap pool',
    "Children's splash pool",
    'Fully equipped gymnasium',
    'Yoga and meditation deck',
    'Indoor badminton court',
    'Squash court',
    'Half basketball court',
    'Box cricket turf',
    'Jogging track (720 m)',
    'Cycling loop',
    'Clubhouse with banquet hall',
    'Co-working lounge with high-speed Wi-Fi',
    'Business meeting pod',
    'Library and reading room',
    'Multipurpose sports hall',
    'Indoor games room (pool, table tennis, carrom)',
    'Amphitheatre',
    'Senior citizens seating court',
    "Toddlers' play area",
    'Skating rink',
    'Pet park',
    'Organic community garden',
    'Barbecue deck',
    'Rooftop observation deck',
    'Spa and steam room',
    'Salon and convenience store',
    'Creche / day-care room',
    'EV charging bays',
    'Rainwater harvesting system',
    'Sewage treatment plant with treated-water reuse',
    'Solar-assisted common area lighting',
    '100% DG power backup for common areas',
    'Three-tier security with video door phones',
    'Automated visitor management',
    'Two-level basement parking',
  ],

  possession: {
    expectedQuarter: 'Q4 2027',
    expectedDate: 'December 2027',
    constructionStatus: 'Under construction — Towers A and B at 11th slab, Towers C and D at plinth',
    percentComplete: 38,
    note: 'Timelines are as per the current construction plan and the RERA-declared date. They are expected dates, not guarantees.',
  },

  connectivity: [
    { name: 'Rajiv Gandhi Infotech Park Phase 1', category: 'it_park', distanceKm: 2.1, driveTimeMin: 8 },
    { name: 'Rajiv Gandhi Infotech Park Phase 3', category: 'it_park', distanceKm: 3.4, driveTimeMin: 11 },
    { name: 'Mumbai–Pune Expressway entry (Ravet)', category: 'highway', distanceKm: 9.6, driveTimeMin: 22 },
    { name: 'Hinjewadi–Shivajinagar Metro Line 3 (Quadron station)', category: 'metro', distanceKm: 1.4, driveTimeMin: 6 },
    { name: 'Mercedes-Benz International School', category: 'school', distanceKm: 4.2, driveTimeMin: 13 },
    { name: 'Blue Ridge Public School', category: 'school', distanceKm: 2.8, driveTimeMin: 10 },
    { name: 'Ruby Hall Clinic Hinjewadi', category: 'hospital', distanceKm: 3.1, driveTimeMin: 11 },
    { name: 'Xion Mall Hinjewadi', category: 'mall', distanceKm: 3.9, driveTimeMin: 12 },
    { name: 'Pune International Airport', category: 'airport', distanceKm: 28.5, driveTimeMin: 65 },
    { name: 'Pune Railway Station', category: 'railway', distanceKm: 22.0, driveTimeMin: 55 },
  ],

  approvals: [
    'MahaRERA registration (placeholder number — fictional)',
    'PMRDA commencement certificate for Towers A–D',
    'Environmental clearance from SEIAA Maharashtra',
    'Fire NOC (provisional) from Maharashtra Fire Services',
    'Approved building plan sanctioned by PMRDA',
  ],

  paymentPlans: [
    {
      name: 'Construction Linked Plan (CLP)',
      description: 'Payments released against verified construction milestones. The default plan.',
      milestones: [
        { stage: 'Booking amount', percent: 10 },
        { stage: 'Agreement and registration', percent: 20 },
        { stage: 'Plinth completion', percent: 10 },
        { stage: 'Slab-linked instalments (5th, 10th, 15th, 20th)', percent: 40 },
        { stage: 'Finishing and handover', percent: 20 },
      ],
    },
    {
      name: '20:80 Possession-Linked Plan',
      description:
        'Twenty percent up front, the balance on possession. Available on a limited set of inventory and subject to bank approval.',
      milestones: [
        { stage: 'Booking and agreement', percent: 20 },
        { stage: 'On possession', percent: 80 },
      ],
    },
  ],

  bankTieUps: [
    'HDFC Bank',
    'State Bank of India',
    'ICICI Bank',
    'Axis Bank',
    'LIC Housing Finance',
    'Bajaj Housing Finance',
  ],

  charges: {
    maintenancePerSqftPerMonth: 3.5,
    coveredParkingInr: 450_000,
    clubhouseMembershipInr: 175_000,
    note: 'Stamp duty, registration, GST and society formation charges are extra and payable as per prevailing government rates.',
  },

  inventory: [
    { unitId: 'A-0704', tower: 'A', floor: 7, configuration: '1BHK', carpetAreaSqft: 452, facing: 'east', priceInr: 4_850_000, status: 'available' },
    { unitId: 'A-1104', tower: 'A', floor: 11, configuration: '1BHK', carpetAreaSqft: 478, facing: 'north', priceInr: 5_300_000, status: 'available' },
    { unitId: 'A-0902', tower: 'A', floor: 9, configuration: '2BHK', carpetAreaSqft: 715, facing: 'east', priceInr: 7_250_000, status: 'available' },
    { unitId: 'B-0603', tower: 'B', floor: 6, configuration: '2BHK', carpetAreaSqft: 726, facing: 'garden', priceInr: 7_680_000, status: 'available' },
    { unitId: 'B-1203', tower: 'B', floor: 12, configuration: '2BHK', carpetAreaSqft: 768, facing: 'north-east', priceInr: 8_240_000, status: 'available' },
    { unitId: 'B-1803', tower: 'B', floor: 18, configuration: '2BHK', carpetAreaSqft: 768, facing: 'garden', priceInr: 8_600_000, status: 'on_hold' },
    { unitId: 'C-0501', tower: 'C', floor: 5, configuration: '3BHK', carpetAreaSqft: 942, facing: 'west', priceInr: 9_550_000, status: 'available' },
    { unitId: 'C-0801', tower: 'C', floor: 8, configuration: '3BHK', carpetAreaSqft: 985, facing: 'garden', priceInr: 10_400_000, status: 'available' },
    { unitId: 'C-1401', tower: 'C', floor: 14, configuration: '3BHK', carpetAreaSqft: 1_040, facing: 'north-east', priceInr: 11_600_000, status: 'available' },
    { unitId: 'D-0902', tower: 'D', floor: 9, configuration: '3BHK', carpetAreaSqft: 1_128, facing: 'east', priceInr: 12_450_000, status: 'available' },
    { unitId: 'D-1602', tower: 'D', floor: 16, configuration: '3BHK', carpetAreaSqft: 1_252, facing: 'garden', priceInr: 14_100_000, status: 'available' },
    { unitId: 'D-2002', tower: 'D', floor: 20, configuration: '3BHK', carpetAreaSqft: 1_252, facing: 'north-east', priceInr: 14_500_000, status: 'on_hold' },
    { unitId: 'A-0402', tower: 'A', floor: 4, configuration: '2BHK', carpetAreaSqft: 715, facing: 'road', priceInr: 7_020_000, status: 'sold' },
    { unitId: 'C-1101', tower: 'C', floor: 11, configuration: '3BHK', carpetAreaSqft: 1_040, facing: 'west', priceInr: 11_200_000, status: 'sold' },
  ],

  highlights: [
    '1.4 km from the upcoming Quadron metro station on the Hinjewadi–Shivajinagar line',
    '72% open space with a 720 m jogging track',
    'Under 10 minutes to Hinjewadi Phase 1 IT park',
    'Two-level basement parking, so no podium parking eating into open space',
    '35+ amenities including a co-working lounge built for hybrid work',
  ],

  faq: [
    {
      question: 'What is the price of a 2 BHK?',
      answer:
        'Indicative 2 BHK pricing is ₹72 lakh to ₹86 lakh depending on carpet area, floor and facing. All prices are indicative and subject to availability.',
      topics: ['price'],
    },
    {
      question: 'What is the price of a 3 BHK?',
      answer:
        'Indicative 3 BHK pricing runs from ₹95 lakh for the 942 sq ft variant up to ₹1.45 crore for the 1,252 sq ft corner unit. Indicative and subject to availability.',
      topics: ['price'],
    },
    {
      question: 'When is possession?',
      answer:
        'Possession is expected in December 2027, which is Q4 2027, as per the current construction plan and the RERA-declared date.',
      topics: ['possession'],
    },
    {
      question: 'Is the project RERA registered?',
      answer:
        'A MahaRERA registration number is displayed for the project. For this demo the number is a fictional placeholder — a real buyer should always verify it on the MahaRERA portal.',
      topics: ['approvals'],
    },
    {
      question: 'How far is the metro station?',
      answer:
        'The Quadron station on the Hinjewadi–Shivajinagar Metro Line 3 is about 1.4 km away, roughly a six minute drive.',
      topics: ['connectivity'],
    },
    {
      question: 'How far is Hinjewadi Phase 1?',
      answer: 'Rajiv Gandhi Infotech Park Phase 1 is 2.1 km away, about eight minutes by car.',
      topics: ['connectivity'],
    },
    {
      question: 'What is the carpet area of the 2 BHK?',
      answer:
        'The 2 BHK carpet area is between 715 and 768 sq ft, depending on the variant. The larger one adds a study nook off the living room.',
      topics: ['floor_plans'],
    },
    {
      question: 'How many towers and floors are there?',
      answer:
        'Four towers, each G plus 22 floors, on 6.8 acres, with 648 units in total and 72% open space.',
      topics: ['overview'],
    },
    {
      question: 'What amenities are included?',
      answer:
        'Over 35 amenities including a 25-metre lap pool, gymnasium, clubhouse, co-working lounge, box cricket turf, amphitheatre, pet park and EV charging bays.',
      topics: ['amenities'],
    },
    {
      question: 'What are the payment plans?',
      answer:
        'There is a construction-linked plan starting at 10% booking, and a 20:80 possession-linked plan on selected inventory subject to bank approval.',
      topics: ['payment_plan'],
    },
    {
      question: 'Which banks have approved the project?',
      answer:
        'HDFC, SBI, ICICI, Axis, LIC Housing Finance and Bajaj Housing Finance have project approvals in place.',
      topics: ['payment_plan'],
    },
    {
      question: 'What is the maintenance charge?',
      answer:
        'Maintenance is ₹3.5 per sq ft per month. Stamp duty, registration, GST and society formation charges are extra, at prevailing government rates.',
      topics: ['charges'],
    },
    {
      question: 'Is parking included in the price?',
      answer:
        'Covered parking is charged separately at ₹4.5 lakh per bay. There are two levels of basement parking.',
      topics: ['charges'],
    },
    {
      question: 'What is the construction status?',
      answer:
        'Towers A and B are at the 11th slab and Towers C and D are at plinth level. The project is about 38% complete.',
      topics: ['possession'],
    },
    {
      question: 'Are there schools and hospitals nearby?',
      answer:
        'Blue Ridge Public School is 2.8 km away and Mercedes-Benz International School 4.2 km. Ruby Hall Clinic Hinjewadi is 3.1 km away.',
      topics: ['connectivity'],
    },
    {
      question: 'Can I get a home loan?',
      answer:
        'The project is approved with six lenders, so a home loan is straightforward to arrange. Eligibility, interest rate and tenure are decided entirely by the bank — we can introduce you to their representative.',
      topics: ['payment_plan'],
    },
    {
      question: 'What is the booking amount?',
      answer:
        'Booking starts at 10% under the construction-linked plan, or 20% under the possession-linked plan.',
      topics: ['payment_plan'],
    },
    {
      question: 'Is a 1 BHK available?',
      answer:
        'Yes, 1 BHK units of 452 to 478 sq ft carpet are available, indicatively ₹48 lakh to ₹54 lakh.',
      topics: ['price', 'floor_plans'],
    },
    {
      question: 'What is the clubhouse membership fee?',
      answer: 'Clubhouse membership is a one-time ₹1.75 lakh.',
      topics: ['charges'],
    },
    {
      question: 'How far is the airport?',
      answer:
        'Pune International Airport is about 28.5 km away, roughly 65 minutes depending on traffic.',
      topics: ['connectivity'],
    },
  ],
});
