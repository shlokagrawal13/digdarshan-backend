const NationalNews = require('./categoryModels/NationalNews');
const InternationalNews = require('./categoryModels/InternationalNews');
const BusinessNews = require('./categoryModels/BusinessNews');
const SportsNews = require('./categoryModels/SportsNews');
const EntertainmentNews = require('./categoryModels/EntertainmentNews');
const StateNews = require('./categoryModels/StateNews');
const MadhyaPradeshNews = require('./categoryModels/MadhyaPradeshNews');
const ChhattisgarhNews = require('./categoryModels/ChhattisgarhNews');
const OtherStatesNews = require('./categoryModels/OtherStatesNews');
const UttarPradeshNews = require('./categoryModels/UttarPradeshNews');
const HoroscopeNews = require('./categoryModels/HoroscopeNews');
const TechnologyNews = require('./categoryModels/TechnologyNews');
const HealthNews = require('./categoryModels/HealthNews');
const EducationNews = require('./categoryModels/EducationNews');
const LifestyleNews = require('./categoryModels/LifestyleNews');

const models = {
    national: NationalNews,
    international: InternationalNews,
    business: BusinessNews,
    sports: SportsNews,
    entertainment: EntertainmentNews,
    state: StateNews,
    madhyapradesh: MadhyaPradeshNews,
    chhattisgarh: ChhattisgarhNews,
    otherstates: OtherStatesNews,
    uttarpradesh: UttarPradeshNews,
    horoscope: HoroscopeNews,
    technology: TechnologyNews,
    health: HealthNews,
    education: EducationNews,
    lifestyle: LifestyleNews
};

module.exports = models;