import {leagueEndpoint} from './league-device';
export const PUBLIC_LEAGUE_CONFIG='https://lead729726-cell.github.io/Resistor/league-config.json';
export type LeagueConfiguration={schema_version:1;edition:'edu';endpoint:string;identity_namespace:string;availability?:string};
export function validateLeagueConfiguration(value:unknown):LeagueConfiguration{
 const c=value as LeagueConfiguration;
 if(!c||c.schema_version!==1||c.edition!=='edu'||typeof c.identity_namespace!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(c.identity_namespace))throw Error('공용 리그 설정의 제품·버전을 확인할 수 없습니다.');
 const endpoint=leagueEndpoint(c.endpoint);
 if(!endpoint.startsWith('https://'))throw Error('공용 리그 설정은 HTTPS가 필요합니다.');
 return {...c,endpoint};
}
