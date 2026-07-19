import type { Vendor } from '../types';

export const vendors: Vendor[] = [
  {
    id: 'vendor-hassan',
    name: 'Hassan Poultry Farm',
    location: 'Rawang, Selangor',
    story:
      'Pak Hassan has been raising kampung chickens in Rawang for over 25 years. His farm sits on 4 acres of open land where chickens roam freely and eat a natural diet of grains, insects, and vegetables. What started as a backyard hobby grew into the most trusted poultry supplier in the Klang Valley wholesale market. He joined Rimbun FreshGo to reach families directly — cutting out the middleman and ensuring you always get the freshest bird.',
    since: '1998',
    image: 'https://images.pexels.com/photos/1300510/pexels-photo-1300510.jpeg?auto=compress&cs=tinysrgb&w=400',
    coverImage: 'https://images.pexels.com/photos/6210876/pexels-photo-6210876.jpeg?auto=compress&cs=tinysrgb&w=800',
    products: ['broiler-chicken'],
    certifications: ['Halal Certified (JAKIM)', 'MyGAP Certified', 'DOA Registered'],
    qualityStandards: [
      'Free-range, hormone-free rearing',
      'Slaughtered fresh every morning before 6 AM',
      'Chilled (not frozen) within 1 hour of slaughter',
      'Delivered within 12 hours of preparation',
      'Regular veterinary health checks',
    ],
  },
  {
    id: 'vendor-aminah',
    name: 'Aminah Seafood Trading',
    location: 'Pelabuhan Klang, Selangor',
    story:
      'Kak Aminah grew up on the docks of Pelabuhan Klang watching her father unload fish at 4 AM. Today she runs one of the most respected fish trading businesses on the west coast, sourcing directly from local fishermen and managing a cold-chain that gets fish to market within hours. Her commitment to zero-frozen handling has made her the go-to supplier for serious home cooks who know the difference. She brings that same uncompromising standard to every order on Rimbun FreshGo.',
    since: '2005',
    image: 'https://images.pexels.com/photos/1266021/pexels-photo-1266021.jpeg?auto=compress&cs=tinysrgb&w=400',
    coverImage: 'https://images.pexels.com/photos/3296279/pexels-photo-3296279.jpeg?auto=compress&cs=tinysrgb&w=800',
    products: [
      'bawal-emas', 'bawal-hitam', 'bawal-putih',
      'cencaru', 'jenahak-potong', 'jenahak-b',
      'kerisi-a', 'mabong-a', 'merah-potong', 'merah-b',
      'nyok', 'pelaling', 'parang', 'siakap',
      'selar', 'selar-kuning', 'sardin',
      'talapia-merah', 'tenggiri', 'tenggiri-potong',
      'tongkol-hitam', 'tongkol-putih', 'keli',
    ],
    certifications: ['HACCP Certified', 'DOF Registered Supplier', 'Halal Certified (JAKIM)'],
    qualityStandards: [
      'All fish sourced within 24 hours of landing',
      'Strictly never-frozen supply chain',
      'Ice-slurry chilling from boat to delivery bag',
      'Direct partnerships with 12 local fishing families',
      'Sustainable fishing practices supported',
    ],
  },
  {
    id: 'vendor-razif',
    name: 'Razif Aqua & Marine',
    location: 'Kuala Selangor, Selangor',
    story:
      'Razif started as a prawn farmer\'s son in Kuala Selangor and today manages a network of sustainable prawn and squid suppliers along the Selangor and Perak coastline. His philosophy is simple: if it isn\'t fresh enough for his own family\'s table, it doesn\'t go into a delivery bag. Razif was among the first seafood suppliers in the Klang Valley to adopt live-holding tanks and same-day harvesting for prawn orders, giving customers shellfish that taste like they just came out of the sea.',
    since: '2010',
    image: 'https://images.pexels.com/photos/3296279/pexels-photo-3296279.jpeg?auto=compress&cs=tinysrgb&w=400',
    coverImage: 'https://images.pexels.com/photos/566344/pexels-photo-566344.jpeg?auto=compress&cs=tinysrgb&w=800',
    products: ['udang-a', 'udang-rencah', 'sotong-a', 'sotong-kembang'],
    certifications: ['HACCP Certified', 'DOF Registered', 'Halal Certified (JAKIM)', 'MyGAP Aquaculture'],
    qualityStandards: [
      'Prawns harvested same morning as delivery',
      'Zero ammonia tolerance — quality-checked at packing',
      'Squid sourced from day-boats only',
      'Live-holding tanks until final packing',
      'Temperature-controlled delivery bags (below 4°C)',
    ],
  },
];

export const getVendorById = (id: string) => vendors.find((v) => v.id === id);
