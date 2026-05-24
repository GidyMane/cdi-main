import { useState } from 'react';
import { 
  HelpCircle, 
  Search, 
  ChevronDown, 
  ChevronUp, 
  BookOpen, 
  Mail, 
  MessageCircle, 
  FileText
} from 'lucide-react';

interface HelpPageProps {
  isDarkMode?: boolean;
}

interface FAQItem {
  q: string;
  a: string | string[];
}

interface FAQCategory {
  category: string;
  questions: FAQItem[];
}

const FAO_BLUE = '#318DDE';

const faqs: FAQCategory[] = [
  {
    category: 'General Overview',
    questions: [
      {
        q: 'What is the Uganda Multi-Hazard Observatory System?',
        a: 'Uganda Multi-Hazard Observatory System is a web-based platform designed to support climate and weather analysis, disaster awareness, and environmental risk visualization, developed in partnership with FAO.'
      },
      {
        q: 'Who can use the platform?',
        a: [
          'Government agencies',
          'Disaster management organizations',
          'Researchers and NGOs',
          'Climate analysts',
          'Emergency responders',
          'The general public',
        ]
      },
      {
        q: 'What types of hazards does the platform cover?',
        a: 'The platform currently focuses on Floods, Droughts, and Extreme weather events. It also provides monitoring and visualization for weather parameters — Rainfall, Temperature, Humidity, and Wind speed — collected from both Satellite and Weather Stations.'
      },
      {
        q: 'Is the platform free to use?',
        a: 'Yes. Some features are publicly accessible, while advanced analytical or administrative tools may require authorized access.'
      },
      {
        q: 'Is the platform available on mobile devices?',
        a: 'Yes. The platform supports modern mobile browsers and responsive layouts.'
      }
    ]
  },
  {
    category: 'Hazard Monitoring & Data',
    questions: [
      {
        q: 'Where does the platform get its hazard data?',
        a: [
          'Floods — Global Flood Awareness System (GloFAS), NASA Flood Monitoring Systems, UN Satellite Centre, Sentinel 1 & 2',
          'Droughts — Combined Drought Index (CDI) computed from CHIRPS and CHIRTS data',
          'Rainfall — OpenMeteo (hourly at towns), GSMaP_wGauge (district and basin)',
          'Temperature — OpenMeteo (towns), ERA5 Land Hourly (district and basin)',
          'Humidity & Wind Speed — OpenMeteo',
          'Extreme Weather Events — Severe Weather Information Centre',
          'Population — 2024 national census disaggregated to sub-county level',
        ]
      },
      {
        q: 'How often is the data updated?',
        a: 'Some datasets are updated near real-time, while others are refreshed daily or periodically depending on the source and availability.'
      },
      {
        q: 'Can I view historical hazard data?',
        a: 'Yes. Historical datasets for floods, rainfall, and droughts currently extend back to 2002.'
      },
      {
        q: 'How accurate is the hazard information?',
        a: 'Data accuracy depends on the original source, spatial resolution, update frequency, and observational coverage. Each dataset references its authoritative source.'
      },
      {
        q: 'Does the platform provide predictive analytics or forecasting?',
        a: 'The platform includes selected forecasting indicators and hazard trend visualizations, available depending on dataset availability.'
      }
    ]
  },
  {
    category: 'Maps & Visualization',
    questions: [
      {
        q: 'What map layers are available?',
        a: [
          'Flood extent maps',
          'Rainfall amount',
          'Temperature',
          'Drought severity',
          'Humidity',
          'Wind speed',
          'Administrative boundaries',
        ]
      },
      {
        q: 'Can I customize map views?',
        a: [
          'Turn layers on or off',
          'Zoom into specific areas of interest',
          'Filter and switch displayed variables',
        ]
      },
      {
        q: 'Can I upload my own GIS data?',
        a: 'Presently, the platform does not support user GIS data uploads. However, users can download cleaned datasets from the platform for further external analysis, and upload support is planned for future versions.'
      },
      {
        q: 'Does the platform support spatial analysis?',
        a: 'Currently, the platform performs selected spatial analyses internally and displays the resulting outputs dynamically through the interface. User-driven spatial analysis tools are planned for future releases.'
      }
    ]
  },
  {
    category: 'Alerts & Notifications',
    questions: [
      {
        q: 'Can I receive hazard alerts?',
        a: 'Yes. The platform provides notifications and alerts for selected hazard conditions and extreme weather events.'
      },
      {
        q: 'What notification methods are supported?',
        a: [
          'In-platform notifications',
          'Email alerts',
          'Dashboard indicators',
        ]
      },
      {
        q: 'Can I configure custom alert thresholds?',
        a: 'Custom threshold configuration is planned for future versions of the platform.'
      }
    ]
  },
  {
    category: 'Reporting & Data Export',
    questions: [
      {
        q: 'Can I generate reports?',
        a: 'Yes. Users can generate reports and export selected datasets and visualizations directly from the platform.'
      },
      {
        q: 'What export formats are supported?',
        a: ['PDF', 'CSV']
      },
      {
        q: 'Can I download cleaned datasets?',
        a: 'Yes. The platform allows users to download cleaned datasets for external analysis and research purposes.'
      }
    ]
  },
  {
    category: 'Integration & API',
    questions: [
      {
        q: 'Does the platform provide a public API?',
        a: 'Currently, the platform does not provide a public API. Data access is available through the web interface.'
      },
      {
        q: 'Will API access be available in the future?',
        a: 'API integration is being considered for future platform releases to allow programmatic data access.'
      },
      {
        q: 'Can the platform integrate with third-party systems?',
        a: 'Future versions may support integrations with GIS tools, analytical platforms, and external monitoring systems.'
      }
    ]
  },
  {
    category: 'Security & Privacy',
    questions: [
      {
        q: 'How is user data protected?',
        a: [
          'Secure HTTPS connections',
          'Authentication controls',
          'Role-based permissions',
          'Secure hosting infrastructure',
        ]
      },
      {
        q: 'Is user activity logged?',
        a: 'Administrative logging and monitoring may be enabled for operational and security purposes.'
      }
    ]
  },
  {
    category: 'Technical Support',
    questions: [
      {
        q: 'What browsers are supported?',
        a: ['Google Chrome', 'Mozilla Firefox', 'Microsoft Edge', 'Safari']
      },
      {
        q: 'Why is the map loading slowly?',
        a: [
          'Internet connection speed',
          'Number of active map layers',
          'Device performance capability',
          'Dataset size and resolution',
        ]
      },
      {
        q: 'How do I report a technical issue?',
        a: 'Contact the platform support or administrative team through the designated support channels listed at the bottom of this page.'
      }
    ]
  },
  {
    category: 'Future Enhancements',
    questions: [
      {
        q: 'Will additional hazards and datasets be added?',
        a: 'Yes. Future versions plan to expand coverage to include additional environmental and climate-related hazards beyond the current set.'
      },
      {
        q: 'Will user GIS uploads be supported?',
        a: 'Yes. User-upload functionality for custom GIS data is being considered for future platform updates.'
      },
      {
        q: 'Are advanced analytical tools planned?',
        a: [
          'Enhanced analytics and statistical summaries',
          'Interactive and configurable dashboards',
          'Improved forecasting models',
          'Expanded visualization capabilities',
        ]
      }
    ]
  }
];

export default function HelpPage({ isDarkMode = true }: HelpPageProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedIndex, setExpandedIndex] = useState<string | null>('0-0');

  const toggleFAQ = (id: string) => {
    setExpandedIndex(expandedIndex === id ? null : id);
  };

  const textMuted = isDarkMode ? 'text-slate-400' : 'text-slate-500';
  const headerText = isDarkMode ? 'text-white' : 'text-slate-900';
  const cardBg = isDarkMode ? 'bg-slate-800/50' : 'bg-white';
  const borderColor = isDarkMode ? 'border-slate-700' : 'border-slate-200';

  const answerText = (a: string | string[]) =>
    Array.isArray(a) ? a.join(' ') : a;

  const filteredFaqs = faqs.map(cat => ({
    ...cat,
    questions: cat.questions.filter(q =>
      q.q.toLowerCase().includes(searchQuery.toLowerCase()) ||
      answerText(q.a).toLowerCase().includes(searchQuery.toLowerCase())
    )
  })).filter(cat => cat.questions.length > 0);

  return (
    <div className="p-4 md:p-6 min-h-screen">
      <div className="relative z-10 max-w-[1000px] mx-auto">
        {/* Header Ribbon */}
        <div 
          className="relative overflow-hidden rounded-lg md:rounded-xl p-6 md:p-8 mb-6 text-center animate-fade-in-up"
          style={{ background: `linear-gradient(135deg, ${FAO_BLUE}e6 0%, ${FAO_BLUE}99 100%)` }}
        >
          <div className="relative z-10">
            <HelpCircle className="w-12 h-12 text-white/50 mx-auto mb-4" />
            <h1 className="text-2xl md:text-3xl font-bold text-white mb-2">How can we help you?</h1>
            <p className="text-white/80 text-sm md:text-base max-w-2xl mx-auto mb-6">
              Search our knowledge base or browse frequently asked questions to find the information you need.
            </p>
            
            <div className="relative max-w-xl mx-auto">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input 
                type="text"
                placeholder="Search for answers..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-3 rounded-xl bg-white/10 backdrop-blur-md border border-white/20 text-white placeholder:text-white/60 outline-none focus:ring-2 focus:ring-white/30 transition-all"
              />
            </div>
          </div>
        </div>

        {/* Quick Links */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { icon: BookOpen, label: 'User Guide', link: '#' },
            { icon: FileText, label: 'Documentation', link: '#' },
            { icon: Mail, label: 'Contact Support', link: '#' },
            { icon: MessageCircle, label: 'Feedback', link: '#' },
          ].map((item, i) => (
            <a 
              key={i}
              href={item.link}
              className={`${cardBg} ${borderColor} border rounded-xl p-4 flex flex-col items-center gap-2 hover:shadow-md transition-all group`}
            >
              <item.icon className="w-6 h-6" style={{ color: FAO_BLUE }} />
              <span className={`text-xs font-medium ${headerText}`}>{item.label}</span>
            </a>
          ))}
        </div>

        {/* FAQ Section */}
        <div className="space-y-6">
          <h2 className={`text-xl font-bold ${headerText} mb-4`}>Frequently Asked Questions</h2>
          
          {filteredFaqs.length > 0 ? (
            filteredFaqs.map((category, catIdx) => (
              <div key={category.category} className="space-y-3">
                <h3 className={`text-sm font-semibold uppercase tracking-wider ${textMuted}`}>{category.category}</h3>
                <div className="space-y-2">
                  {category.questions.map((item, qIdx) => {
                    const id = `${catIdx}-${qIdx}`;
                    const isExpanded = expandedIndex === id;
                    return (
                      <div 
                        key={id}
                        className={`${cardBg} ${borderColor} border rounded-xl overflow-hidden transition-all`}
                      >
                        <button 
                          onClick={() => toggleFAQ(id)}
                          className="w-full flex items-center justify-between p-4 text-left hover:bg-slate-700/5 transition-colors"
                        >
                          <span className={`text-sm font-medium ${headerText}`}>{item.q}</span>
                          {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                        </button>
                        {isExpanded && (
                          <div className="px-4 pb-4 animate-fade-in">
                            {Array.isArray(item.a) ? (
                              <ul className={`text-sm leading-relaxed ${textMuted} list-disc list-inside space-y-1`}>
                                {item.a.map((point, i) => <li key={i}>{point}</li>)}
                              </ul>
                            ) : (
                              <p className={`text-sm leading-relaxed ${textMuted}`}>{item.a}</p>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-12">
              <p className={textMuted}>No results found for "{searchQuery}"</p>
            </div>
          )}
        </div>

        {/* Footer Info */}
        <div className="mt-12 text-center pb-8">
          <p className={`text-sm ${textMuted}`}>
            Still need help? <a href="#" className="font-medium hover:underline" style={{ color: FAO_BLUE }}>Contact our technical team</a>
          </p>
          <div className="flex items-center justify-center gap-4 mt-4 opacity-50">
            <span className="text-[10px] uppercase tracking-widest font-bold">Uganda Multi-Hazard Observatory</span>
            <span className="w-1 h-1 rounded-full bg-slate-500"></span>
            <span className="text-[10px] uppercase tracking-widest font-bold">FAO partnership</span>
          </div>
        </div>
      </div>
    </div>
  );
}
