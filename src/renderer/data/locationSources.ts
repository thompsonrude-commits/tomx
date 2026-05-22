import { ExtractionSource } from '../types';

export interface SourceInfo {
  id: ExtractionSource;
  label: string;
}

export interface CountrySources {
  b2b: SourceInfo[];
  localEngines: SourceInfo[];
}

export const SOURCES_BY_COUNTRY: Record<string, CountrySources> = {
  'India': {
    b2b: [
      { id: 'indiamart', label: 'IndiaMART' },
      { id: 'justdial', label: 'Justdial' },
      { id: 'tradeindia', label: 'TradeIndia' }
    ],
    localEngines: []
  },
  'United Kingdom': {
    b2b: [
      { id: 'yellowpages_uk', label: 'Yellow Pages UK' },
      { id: 'cylex_uk', label: 'Cylex UK' },
      { id: 'thomsonlocal', label: 'Thomson Local' },
      { id: 'yelp_uk', label: 'Yelp UK' }
    ],
    localEngines: []
  },
  'United States': {
    b2b: [
      { id: 'yellowpages', label: 'Yellow Pages' },
      { id: 'yelp_us', label: 'Yelp USA' },
      { id: 'manta', label: 'Manta' },
      { id: 'whitepages', label: 'WhitePages' }
    ],
    localEngines: []
  },
  'Nigeria': {
    b2b: [
      { id: 'vconnect', label: 'VConnect' },
      { id: 'businesslist', label: 'BusinessList' },
      { id: 'yellowpages_ng', label: 'Yellow Pages NG' }
    ],
    localEngines: []
  },
  'United Arab Emirates': {
    b2b: [
      { id: 'yellowpages_ae', label: 'Yellow Pages AE' },
      { id: 'localsearch_ae', label: 'LocalSearch.ae' }
    ],
    localEngines: []
  },
  'Germany': {
    b2b: [
      { id: 'gelbeseiten_de', label: 'Gelbe Seiten' },
      { id: 'wlw_de', label: 'WLW (Germany)' },
      { id: 'goyellow_de', label: 'GoYellow.de' }
    ],
    localEngines: []
  },
  'France': {
    b2b: [
      { id: 'pagesjaunes_fr', label: 'Pages Jaunes' },
      { id: 'europages_fr', label: 'Europages FR' }
    ],
    localEngines: [{ id: 'qwant', label: 'Qwant (FR)' }]
  },
  'Italy': {
    b2b: [
      { id: 'paginegialle_it', label: 'Pagine Gialle' },
      { id: 'hotfrog_it', label: 'Hotfrog IT' }
    ],
    localEngines: []
  },
  'Spain': {
    b2b: [
      { id: 'paginasamarillas_es', label: 'Paginas Amarillas' },
      { id: 'pyme_es', label: 'Pyme.es' }
    ],
    localEngines: []
  },
  'Brazil': {
    b2b: [
      { id: 'telelistas_br', label: 'Telelistas.net' },
      { id: 'guiamais_br', label: 'Guia Mais' },
      { id: 'apontador_br', label: 'Apontador' }
    ],
    localEngines: []
  },
  'Japan': {
    b2b: [
      { id: 'townpage_jp', label: 'TownPage (iTP)' },
      { id: 'ekiten_jp', label: 'Ekiten.jp' }
    ],
    localEngines: [{ id: 'goo_jp', label: 'Goo.ne.jp' }]
  },
  'Turkey': {
    b2b: [
      { id: 'yellowpages_tr', label: 'Yellow Pages TR' },
      { id: 'bulurum_tr', label: 'Bulurum.com' }
    ],
    localEngines: []
  },
  'Canada': {
    b2b: [
      { id: 'yellowpages_ca', label: 'Yellow Pages CA' },
      { id: '411_ca', label: '411.ca' },
      { id: 'canadaone', label: 'CanadaOne' }
    ],
    localEngines: []
  },
  'Australia': {
    b2b: [
      { id: 'yellowpages_au', label: 'Yellow Pages AU' },
      { id: 'truelocal', label: 'TrueLocal' },
      { id: 'whitepages_au', label: 'WhitePages AU' }
    ],
    localEngines: []
  },
  'South Africa': {
    b2b: [
      { id: 'yellowpages_za', label: 'Yellow Pages ZA' },
      { id: 'brabys', label: 'Brabys' },
      { id: 'sayellow_za', label: 'SA Yellow' }
    ],
    localEngines: []
  },
  'Russia': {
    b2b: [],
    localEngines: [{ id: 'yandex', label: 'Yandex (RU)' }]
  },
  'China': {
    b2b: [],
    localEngines: [{ id: 'baidu', label: 'Baidu (CN)' }]
  },
  'South Korea': {
    b2b: [],
    localEngines: [{ id: 'naver', label: 'Naver (KR)' }]
  },
  'Czech Republic': {
    b2b: [],
    localEngines: [{ id: 'seznam', label: 'Seznam (CZ)' }]
  },
  'Global (No specific location)': {
    b2b: [
      { id: 'yellowpages', label: 'Yellow Pages Global' },
      { id: 'craigslist', label: 'Craigslist' }
    ],
    localEngines: []
  }
};
