export interface VariantMeta {
  title: string;
  description: string;
  keywords: string;
  url: string;
  siteName: string;
  shortName: string;
  subject: string;
  classification: string;
  categories: string[];
  features: string[];
}

export const VARIANT_META: { full: VariantMeta; [k: string]: VariantMeta } = {
  full: {
    title: 'SkyGuard AI — Airspace Intelligence Engine',
    description: 'AI-powered real-time airspace monitoring with ML threat detection, trajectory prediction, and agentic intelligence.',
    keywords: 'airspace monitoring, flight tracking, threat detection, drone detection, ADS-B tracking, radar monitoring, airspace intelligence, DGCA compliance, anomaly detection',
    url: '/',
    siteName: 'SkyGuard AI',
    shortName: 'SkyGuard',
    subject: 'AI-Powered Airspace Intelligence and Threat Detection',
    classification: 'Airspace Monitoring, Threat Intelligence',
    categories: ['security', 'productivity'],
    features: [
      'Real-time flight tracking',
      'ML-based anomaly detection',
      'Drone and UAV identification',
      'Trajectory prediction',
      'AI-powered threat analysis',
      'No-fly zone monitoring',
      'Weather alerts',
      'DGCA compliance',
    ],
  },
  tech: {
    title: 'Tech Monitor - Real-Time AI & Tech Industry Dashboard',
    description: 'Real-time AI and tech industry dashboard tracking tech giants, AI labs, startup ecosystems, funding rounds, and tech events worldwide.',
    keywords: 'tech dashboard, AI industry, startup ecosystem, tech companies, AI labs, venture capital, tech events, tech conferences, cloud infrastructure, datacenters, tech layoffs, funding rounds, unicorns, FAANG, tech HQ, accelerators, Y Combinator, tech news',
    url: '/',
    siteName: 'Tech Monitor',
    shortName: 'TechMonitor',
    subject: 'AI, Tech Industry, and Startup Ecosystem Intelligence',
    classification: 'Tech Dashboard, AI Tracker, Startup Intelligence',
    categories: ['news', 'business'],
    features: [
      'Tech news aggregation',
      'AI lab tracking',
      'Startup ecosystem mapping',
      'Tech HQ locations',
      'Conference & event calendar',
      'Cloud infrastructure monitoring',
      'Datacenter mapping',
      'Tech layoff tracking',
      'Funding round analytics',
      'Tech stock tracking',
      'Service status monitoring',
    ],
  },
  happy: {
    title: 'Happy Monitor - Good News & Global Progress',
    description: 'Curated positive news, progress data, and uplifting stories from around the world.',
    keywords: 'good news, positive news, global progress, happy news, uplifting stories, human achievement, science breakthroughs, conservation wins',
    url: '/',
    siteName: 'Happy Monitor',
    shortName: 'HappyMonitor',
    subject: 'Good News, Global Progress, and Human Achievement',
    classification: 'Positive News Dashboard, Progress Tracker',
    categories: ['news', 'lifestyle'],
    features: [
      'Curated positive news',
      'Global progress tracking',
      'Live humanity counters',
      'Science breakthrough feed',
      'Conservation tracker',
      'Renewable energy dashboard',
    ],
  },
  finance: {
    title: 'Finance Monitor - Real-Time Markets & Trading Dashboard',
    description: 'Real-time finance and trading dashboard tracking global markets, stock exchanges, central banks, commodities, forex, crypto, and economic indicators worldwide.',
    keywords: 'finance dashboard, trading dashboard, stock market, forex, commodities, central banks, crypto, economic indicators, market news, financial centers, stock exchanges, bonds, derivatives, fintech, hedge funds, IPO tracker, market analysis',
    url: '/',
    siteName: 'Finance Monitor',
    shortName: 'FinanceMonitor',
    subject: 'Global Markets, Trading, and Financial Intelligence',
    classification: 'Finance Dashboard, Market Tracker, Trading Intelligence',
    categories: ['finance', 'news'],
    features: [
      'Real-time market data',
      'Stock exchange mapping',
      'Central bank monitoring',
      'Commodity price tracking',
      'Forex & currency news',
      'Crypto & digital assets',
      'Economic indicator alerts',
      'IPO & earnings tracking',
      'Financial center mapping',
      'Sector heatmap',
      'Market radar signals',
    ],
  },
  commodity: {
    title: 'Commodity Monitor - Real-Time Commodity Markets & Supply Chain Dashboard',
    description: 'Real-time commodity markets dashboard tracking mining sites, processing plants, commodity ports, supply chains, and global commodity trade flows.',
    keywords: 'commodity dashboard, mining sites, processing plants, commodity ports, supply chain, commodity markets, oil, gas, metals, agriculture, mining operations, commodity trade, logistics, infrastructure, resource tracking, commodity prices, futures markets',
    url: '/',
    siteName: 'Commodity Monitor',
    shortName: 'CommodityMonitor',
    subject: 'Commodity Markets, Mining, and Supply Chain Intelligence',
    classification: 'Commodity Dashboard, Supply Chain Tracker, Resource Intelligence',
    categories: ['finance', 'business'],
    features: [
      'Mining site tracking',
      'Processing plant monitoring',
      'Commodity port mapping',
      'Supply chain visualization',
      'Commodity price tracking',
      'Trade flow analysis',
      'Resource extraction monitoring',
      'Logistics infrastructure',
      'Commodity market news',
      'Futures market data',
    ],
  },
};
