import {renderToStaticMarkup} from 'react-dom/server';
import {describe,it,expect} from 'vitest';
import {Scoreboard} from './Scoreboard';
import {createInitialWorld} from '../physics';
import {createInitialMatchState} from '../match/match-machine';
import {createPlayerSkillProfile,createOpponentProfile} from '../opponent/model';

describe('royal gem scoreboard',()=>{
  it.each(['solid','stripe'] as const)('shows royal names and correct IDs when player owns %s',group=>{
    const match={...createInitialMatchState(),playerGroup:group,breaking:false};const world=createInitialWorld(()=>.5),profile=createPlayerSkillProfile();
    const html=renderToStaticMarkup(<Scoreboard match={match} worldView={world} playerSkill={profile} opponentProfile={createOpponentProfile(profile,'practice')} />);
    expect(html).toContain('公主');expect(html).toContain('谢不赢');expect(html).toContain('红宝石球');expect(html).toContain('黄宝石球');expect(html).not.toContain('顾燃');expect(html).not.toContain('王子');expect(html).not.toContain('花色球');
    const mobile=html.slice(html.indexOf('mobile-ball-rack'),html.indexOf('mobile-identity opponent'));
    expect(mobile).toContain(group==='stripe'?'>15</span>':'>7</span>');expect(mobile).toContain('>8</span>');
  });
});
