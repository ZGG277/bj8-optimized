import {renderToStaticMarkup} from 'react-dom/server';
import {describe,it,expect} from 'vitest';
import {Scoreboard} from './Scoreboard';
import {createInitialWorld} from '../physics';
import {createInitialMatchState} from '../match/match-machine';
import {createPlayerSkillProfile,createOpponentProfile} from '../opponent/model';

describe('one-row ball progress',()=>{
  it.each(['solid','stripe'] as const)('maps both racks correctly when the player owns %s',group=>{
    const match={...createInitialMatchState(),playerGroup:group,breaking:false};
    const world=createInitialWorld(()=>.5),profile=createPlayerSkillProfile();
    world.balls.find(ball=>ball.number===3)!.active=false;
    world.balls.find(ball=>ball.number===12)!.active=false;
    const html=renderToStaticMarkup(<Scoreboard match={match} worldView={world} playerSkill={profile} opponentProfile={createOpponentProfile(profile,'practice')} />);
    const player=html.slice(html.indexOf('royal-player player'),html.indexOf('royal-eight'));
    const opponent=html.slice(html.indexOf('royal-player opponent'));
    expect(player).toContain(`data-ball-number="${group==='stripe'?15:7}"`);
    expect(opponent).toContain(`data-ball-number="${group==='stripe'?7:15}"`);
    expect(html).toContain('aria-label="3号已进" class="mini-ball solid down"');
    expect(html).toContain('aria-label="12号已进" class="mini-ball stripe down"');
    expect(html.match(/data-ball-number="8"/g)).toHaveLength(1);
    expect(html).not.toContain('skill-level');
    // Group prose is available to a screen reader, not painted in the row.
    const visible=html.replace(/<span class="royal-sr-only"[\s\S]*?<\/span>/g,'').replace(/<[^>]*>/g,'');
    expect(visible).toBe('公主8沈予白');
  });
  it('does not claim group ownership before the first legal assignment',()=>{
    const world=createInitialWorld(()=>.5),profile=createPlayerSkillProfile();
    const html=renderToStaticMarkup(<Scoreboard match={createInitialMatchState()} worldView={world} playerSkill={profile} opponentProfile={createOpponentProfile(profile,'practice')}/>);
    expect(html.match(/class="mini-ball unassigned"/g)).toHaveLength(14);
    expect(html).not.toContain('data-ball-number="1"');
  });
});
