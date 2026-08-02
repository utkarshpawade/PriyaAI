import { projectSchema, type Project } from './schema.js';

/**
 * FICTIONAL PROJECT — demo data only.
 *
 * The second project exists so that "change the location" and "raise the
 * budget" mid-call tests have somewhere real to land: east Pune instead of
 * west, and a ₹1.35 Cr+ band instead of ₹48 L+.
 */
export const meridianVerde: Project = projectSchema.parse({
  IS_FICTIONAL: true,

  slug: 'meridian-verde',
  name: 'Meridian Verde',
  developer: 'Meridian Group',
  developerNote: 'Same fictional developer as Aureva Skyline; this is their premium east-Pune line.',
  reraId: 'P52100099002 (FICTIONAL — placeholder, not a real RERA registration)',
  reraNote:
    'Placeholder in MahaRERA format for demo purposes only. A real buyer must verify on the MahaRERA portal.',
  propertyType: 'apartment',
  positioning:
    'Premium 3 and 4 BHK residences in Kharadi for senior IT and finance professionals working in EON and World Trade Center.',

  location: {
    locality: 'Kharadi',
    city: 'Pune',
    state: 'Maharashtra',
    pincode: '411014',
    latitude: 18.5515,
    longitude: 73.9422,
    aliases: ['kharadi', 'eon', 'eon it park', 'world trade center pune', 'east pune', 'wtc'],
  },

  scale: {
    landAreaAcres: 4.2,
    towers: 2,
    floorsPerTower: 'G + 28 floors',
    totalUnits: 224,
    openSpacePercent: 68,
  },

  configurations: [
    {
      configuration: '3BHK',
      label: '3 BHK Premium',
      carpetAreaSqft: [1_290, 1_365],
      bathrooms: 3,
      balconies: 2,
      priceBandInr: [13_800_000, 16_200_000],
      floorPlanNote:
        'Three bedrooms with a 9 ft deep living-room deck. Master bedroom has a walk-in wardrobe.',
    },
    {
      configuration: '4BHK+',
      label: '4 BHK and duplex penthouse',
      carpetAreaSqft: [1_780, 2_140],
      bathrooms: 4,
      balconies: 3,
      priceBandInr: [19_500_000, 28_500_000],
      floorPlanNote:
        'Four bedrooms with a servant room and private lift lobby. Top two floors are duplex penthouses with a private terrace.',
    },
  ],

  amenities: [
    'Infinity-edge rooftop pool',
    'Temperature-controlled indoor pool',
    'Double-height clubhouse',
    'Fitness studio with personal training zone',
    'Yoga and pilates studio',
    'Spa with sauna and steam',
    'Squash court',
    'Indoor badminton court',
    'Golf simulator room',
    'Private theatre (18 seats)',
    'Co-working lounge and meeting rooms',
    'Business centre',
    'Banquet hall with catering pantry',
    'Wine and cigar lounge',
    'Library',
    'Art gallery walk',
    'Sky deck on the 28th floor',
    'Landscaped podium garden',
    'Reflexology walkway',
    'Jogging track (480 m)',
    "Children's play zone",
    'Creche',
    'Skating rink',
    'Pet grooming station',
    'Organic herb garden',
    'Barbecue pavilion',
    'Guest suites for visitors',
    'Concierge desk',
    'EV charging for every covered bay',
    'Rainwater harvesting',
    'Sewage treatment plant',
    'Full-building DG backup',
    'Facial-recognition access control',
    'Three-level basement parking',
  ],

  possession: {
    expectedQuarter: 'Q2 2028',
    expectedDate: 'June 2028',
    constructionStatus: 'Under construction — Tower 1 at 6th slab, Tower 2 excavation complete',
    percentComplete: 22,
    note: 'Expected dates as per the current construction plan and the RERA-declared date, not a guarantee.',
  },

  connectivity: [
    { name: 'EON IT Park Kharadi', category: 'it_park', distanceKm: 1.2, driveTimeMin: 5 },
    { name: 'World Trade Center Pune', category: 'it_park', distanceKm: 1.8, driveTimeMin: 7 },
    { name: 'Pune–Ahmednagar Highway', category: 'highway', distanceKm: 2.4, driveTimeMin: 8 },
    { name: 'Ramwadi Metro Station (Line 2)', category: 'metro', distanceKm: 4.6, driveTimeMin: 14 },
    { name: 'Victorious Kidss Educares', category: 'school', distanceKm: 2.2, driveTimeMin: 8 },
    { name: 'Columbia Asia Hospital Kharadi', category: 'hospital', distanceKm: 1.9, driveTimeMin: 7 },
    { name: 'Phoenix Marketcity Viman Nagar', category: 'mall', distanceKm: 6.8, driveTimeMin: 20 },
    { name: 'Pune International Airport', category: 'airport', distanceKm: 8.4, driveTimeMin: 24 },
    { name: 'Pune Railway Station', category: 'railway', distanceKm: 11.5, driveTimeMin: 32 },
  ],

  approvals: [
    'MahaRERA registration (placeholder number — fictional)',
    'PMC commencement certificate',
    'Environmental clearance from SEIAA Maharashtra',
    'Fire NOC (provisional)',
    'Approved building plan sanctioned by PMC',
  ],

  paymentPlans: [
    {
      name: 'Construction Linked Plan (CLP)',
      description: 'Milestone-linked payments verified against construction progress.',
      milestones: [
        { stage: 'Booking amount', percent: 10 },
        { stage: 'Agreement and registration', percent: 20 },
        { stage: 'Slab-linked instalments', percent: 50 },
        { stage: 'Finishing and handover', percent: 20 },
      ],
    },
  ],

  bankTieUps: ['HDFC Bank', 'ICICI Bank', 'State Bank of India', 'Kotak Mahindra Bank'],

  charges: {
    maintenancePerSqftPerMonth: 5.2,
    coveredParkingInr: 750_000,
    clubhouseMembershipInr: 350_000,
    note: 'Stamp duty, registration, GST and society formation charges are extra, at prevailing government rates.',
  },

  inventory: [
    { unitId: 'T1-0803', tower: 'T1', floor: 8, configuration: '3BHK', carpetAreaSqft: 1_290, facing: 'east', priceInr: 13_850_000, status: 'available' },
    { unitId: 'T1-1403', tower: 'T1', floor: 14, configuration: '3BHK', carpetAreaSqft: 1_320, facing: 'garden', priceInr: 14_900_000, status: 'available' },
    { unitId: 'T1-2103', tower: 'T1', floor: 21, configuration: '3BHK', carpetAreaSqft: 1_365, facing: 'north-east', priceInr: 16_100_000, status: 'available' },
    { unitId: 'T2-1001', tower: 'T2', floor: 10, configuration: '4BHK+', carpetAreaSqft: 1_780, facing: 'east', priceInr: 19_600_000, status: 'available' },
    { unitId: 'T2-1701', tower: 'T2', floor: 17, configuration: '4BHK+', carpetAreaSqft: 1_845, facing: 'garden', priceInr: 21_800_000, status: 'available' },
    { unitId: 'T2-2701', tower: 'T2', floor: 27, configuration: '4BHK+', carpetAreaSqft: 2_140, facing: 'north-east', priceInr: 28_400_000, status: 'on_hold' },
    { unitId: 'T1-0503', tower: 'T1', floor: 5, configuration: '3BHK', carpetAreaSqft: 1_290, facing: 'road', priceInr: 13_400_000, status: 'sold' },
    { unitId: 'T2-1201', tower: 'T2', floor: 12, configuration: '4BHK+', carpetAreaSqft: 1_780, facing: 'west', priceInr: 19_950_000, status: 'sold' },
  ],

  highlights: [
    'Five minutes from EON IT Park, seven from World Trade Center',
    '24 minutes to Pune airport — the shortest airport run of any Meridian project',
    'Only 224 units across two towers, so a low-density premium address',
    'Duplex penthouses with private terraces on the top two floors',
  ],

  faq: [
    {
      question: 'What is the price of a 3 BHK in Meridian Verde?',
      answer:
        'Indicative 3 BHK pricing is ₹1.38 crore to ₹1.62 crore depending on carpet area and floor. Indicative and subject to availability.',
      topics: ['price'],
    },
    {
      question: 'What is the price of a 4 BHK?',
      answer:
        'The 4 BHK band is ₹1.95 crore to ₹2.85 crore, the top end being the duplex penthouse. Indicative and subject to availability.',
      topics: ['price'],
    },
    {
      question: 'When is possession for Meridian Verde?',
      answer:
        'Expected possession is June 2028, Q2 2028, as per the current construction plan and the RERA-declared date.',
      topics: ['possession'],
    },
    {
      question: 'How far is EON IT Park?',
      answer: 'EON IT Park Kharadi is 1.2 km away, about a five minute drive.',
      topics: ['connectivity'],
    },
    {
      question: 'How far is the airport?',
      answer: 'Pune International Airport is 8.4 km, roughly 24 minutes.',
      topics: ['connectivity'],
    },
    {
      question: 'How many units are there?',
      answer: 'Two hundred twenty-four units across two towers on 4.2 acres, with 68% open space.',
      topics: ['overview'],
    },
    {
      question: 'What is the maintenance charge?',
      answer:
        'Maintenance is ₹5.2 per sq ft per month, which reflects the higher amenity load of the premium clubhouse.',
      topics: ['charges'],
    },
    {
      question: 'Is there a penthouse?',
      answer:
        'Yes, the top two floors of Tower 2 are duplex penthouses of 2,140 sq ft carpet with a private terrace.',
      topics: ['floor_plans'],
    },
    {
      question: 'Which banks are tied up?',
      answer: 'HDFC, ICICI, SBI and Kotak Mahindra have project approvals.',
      topics: ['payment_plan'],
    },
    {
      question: 'What is the construction status?',
      answer:
        'Tower 1 is at the 6th slab and Tower 2 has completed excavation. The project is about 22% complete.',
      topics: ['possession'],
    },
  ],
});
