(() => {
  'use strict';
  if (window.DBLStoryGeneratorEngine) return;

  // Deliberately written as fictional 1968 news prompts, never factual
  // allegations about players. Additional year catalogs can be added here.
  const STORIES_1968 = [
    {
      title: 'Locker Room Fistfight', category: 'Clubhouse', plan: 'teammates2',
      text: 'Two teammates come to blows following weeks of personal disagreements. One suffers a broken nose, and management attempts to conceal the incident until a local reporter discovers what happened.'
    },
    {
      title: 'Player Arrested in Prostitution Raid', category: 'Police & Society', plan: 'veteran',
      text: 'A prominent veteran is among several men questioned when police raid a hotel suspected of operating a prostitution ring. Although no charges are immediately filed against him, newspapers publish his name, threatening his marriage and reputation.',
      caution: 'Marital status is not recorded reliably in the league export; confirm it before adopting the story as league canon.'
    },
    {
      title: 'Civil Rights Walkout', category: 'Civil Rights', plan: 'team3',
      text: 'Several Negro players refuse to participate in a scheduled exhibition after a local hotel denies accommodations to their families. Teammates disagree over whether to support the protest, creating divisions within the club.',
      caution: 'The league export does not reliably identify racial background or family accommodations. Confirm the players’ identities and these circumstances before adopting the story.'
    },
    {
      title: 'Drunken Driving Arrest', category: 'Police & Society', plan: 'star',
      text: 'A popular player is arrested after crashing his automobile into a parked vehicle following a night of drinking. The incident becomes considerably more serious when investigators discover that a passenger was injured.'
    },
    {
      title: 'Marijuana Scandal', category: 'Police & Society', plan: 'league3',
      text: 'Police discover marijuana cigarettes during a raid on a private party attended by several DBL players. One player is arrested, while others deny knowledge of the drugs, prompting an investigation into the league’s increasingly youthful counterculture.'
    },
    {
      title: 'Franchise Threatens Relocation', category: 'Franchise Affairs', plan: 'team',
      text: 'An owner publicly threatens to move his club to another city unless municipal authorities approve a new arena lease. The announcement sparks demonstrations by supporters and accusations that the owner is deliberately undermining attendance to justify a departure.'
    },
    {
      title: 'Coach Accused of Racial Discrimination', category: 'Civil Rights', plan: 'team3veteran',
      text: 'Several players accuse their coach of applying different disciplinary standards to white and Negro athletes. The controversy escalates when a respected veteran publicly demands the coach’s dismissal.',
      caution: 'The league export does not reliably establish player racial backgrounds or a coach’s conduct. Verify those details separately.'
    },
    {
      title: 'Player Refuses Military Service', category: 'Politics & Vietnam', plan: 'youngStar',
      text: 'A young DBL star announces that he will refuse induction into the armed forces on moral grounds, citing his opposition to an ongoing war. His decision divides supporters, attracts political attention, and raises the possibility of imprisonment.',
      caution: 'Draft eligibility, military status, and personal beliefs are not available in the league export; this is a fictional premise.'
    },
    {
      title: 'Gambling Investigation', category: 'League Integrity', plan: 'league3',
      text: 'Authorities discover that a well-known gambler has been making regular telephone calls to several DBL players. No evidence of fixed contests has emerged, but league officials begin questioning those involved about their relationships with bookmakers.'
    },
    {
      title: 'Extramarital Affair Exposed', category: 'Personal Lives', plan: 'different2',
      text: 'A married star becomes the subject of a sensational newspaper investigation after being photographed entering a hotel with the wife of another DBL player. The resulting confrontation threatens to destroy friendships and fracture two clubs.',
      caution: 'Marriage and relationship information is not available in the league export; confirm these details before treating the story as canon.'
    },
    {
      title: 'Owner Linked to Organized Crime', category: 'Franchise Affairs', plan: 'team',
      text: 'A newspaper investigation alleges that a franchise owner has longstanding business relationships with figures associated with organized crime. The DBL considers whether ownership restrictions are necessary to protect the league’s reputation.'
    },
    {
      title: 'Player Assaults Newspaper Reporter', category: 'Press & Reputation', plan: 'star',
      text: 'Enraged by an article criticizing his personal conduct, a player confronts a sportswriter outside the team’s dressing room and strikes him. The reporter threatens criminal charges while demanding an unprecedented league suspension.'
    },
    {
      title: 'Players Threaten League-Wide Strike', category: 'Labor & Contracts', plan: 'veterans3',
      text: 'A group of prominent veterans secretly organizes a campaign demanding improved pensions, medical coverage, and greater freedom in contract negotiations. Owners refuse to recognize their representatives, raising the possibility of a work stoppage.'
    },
    {
      title: 'Interracial Marriage Sparks Controversy', category: 'Civil Rights', plan: 'single',
      text: 'A white DBL player announces his engagement to a Negro woman, drawing hostile letters and threats from segregationist groups. The player refuses to conceal the relationship, while his club faces pressure to intervene.',
      caution: 'Neither the player’s racial background nor his engagement is established by the league export. Confirm these before adopting the story.'
    },
    {
      title: 'Cocaine or Heroin Arrest', category: 'Police & Society', plan: 'young',
      text: 'A promising young player is arrested in possession of narcotics after police investigate an apartment frequented by musicians and entertainers. His attorney claims he has developed a dependency, raising questions about whether the league should pursue punishment or treatment.'
    },
    {
      title: 'Team Physician Accused of Distributing Stimulants', category: 'Medical Ethics', plan: 'former2',
      text: 'Former players allege that a club physician routinely supplied amphetamine tablets to athletes before long road trips. An investigation threatens the physician’s medical license and raises broader concerns about drug use throughout professional basketball.'
    },
    {
      title: 'Antiwar Demonstration Disrupts Team Appearance', category: 'Politics & Vietnam', plan: 'team3',
      text: 'Several players attending a public promotional event are confronted by antiwar demonstrators demanding that professional athletes speak against military intervention. One player joins the protesters, infuriating his club’s conservative ownership.'
    },
    {
      title: 'Player’s Wife Accuses Him of Domestic Violence', category: 'Police & Society', plan: 'veteran',
      text: 'The wife of a prominent veteran files a police complaint alleging that her husband assaulted her during an argument at their home. The accusation produces intense newspaper scrutiny, with management criticized for attempting to characterize the matter as a private family dispute.',
      caution: 'The league export cannot verify marital status or personal conduct. This is an invented scenario, not an established accusation.'
    }
  ].map((entry, index) => Object.freeze({ ...entry, id: index + 1, year: 1968 }));

  const CATALOGS = Object.freeze({1968: Object.freeze(STORIES_1968)});
  const integer = value => value === null || value === undefined || value === '' ? null :
    Number.isInteger(Number(value)) ? Number(value) : null;
  const number = value => Number.isFinite(Number(value)) ? Number(value) : null;
  const namePart = value => typeof value === 'string' ? value.trim() : '';
  const fullName = (region, name) => [namePart(region), namePart(name)].filter(Boolean).join(' ');
  const pick = (array, rng) => array[Math.min(array.length - 1,
    Math.floor(Math.max(0, Math.min(.99999999, rng())) * array.length))] || null;
  const distinct = values => [...new Set(values)];
  const isVeteran = p => p.experience >= 4 || (p.age !== null && p.age >= 29);
  const isYoung = p => (p.age !== null ? p.age <= 27 : p.experience <= 2) &&
    p.experience <= 4;
  function rankPick(players, mode, rng) {
    let eligible = players;
    if (mode === 'veteran' || mode === 'veteranStar') eligible = players.filter(isVeteran);
    if (mode === 'young' || mode === 'youngStar') eligible = players.filter(isYoung);
    if (!eligible.length) return null;
    if (mode === 'star' || mode === 'veteranStar' || mode === 'youngStar') {
      const sorted = [...eligible].sort((a, b) => b.score - a.score || a.pid - b.pid);
      eligible = sorted.slice(0, Math.max(1, Math.ceil(sorted.length * .35)));
    }
    return pick(eligible, rng);
  }
  function chooseUnique(players, modes, rng) {
    const selected = [];
    for (const mode of modes) {
      const next = rankPick(players.filter(p => !selected.some(x => x.pid === p.pid)),
        mode, rng);
      if (!next) return null;
      selected.push(next);
    }
    return selected;
  }
  function teamCandidates(roster, count = 1, veterans = false, former = false) {
    return roster.teams.filter(team =>
      (former ? team.former : team.players).length >= count &&
      (!veterans || team.players.some(isVeteran)));
  }

  // Only teams participating in 1968 appear. For older league exports, use
  // 1968 season stats; for an in-progress 1968 export, include live roster
  // members who have not yet played. Never draw players from a later year.
  async function buildRoster(file, reader, year = 1968) {
    if (!reader?.readTopLevelValue || !reader?.forEachTopLevelArrayItem)
      throw Error('The league file reader is unavailable.');
    const attributes = await reader.readTopLevelValue(file, 'gameAttributes') || {};
    const fileYear = integer(attributes.season);
    if (fileYear === null) throw Error('The file has no recognizable league season.');
    if (fileYear < year) throw Error('This league file has not reached ' + year + ' yet.');
    const byTid = new Map();
    await reader.forEachTopLevelArrayItem(file, 'teams', row => {
      const tid = integer(row?.tid);
      if (tid === null || tid < 0) return;
      const years = Array.isArray(row.seasons) ? row.seasons : [];
      const historical = years.find(record => integer(record?.season) === year);
      if (!historical && fileYear !== year) return;
      if (!historical && row.disabled === true) return;
      const named = historical || row;
      const teamName = fullName(named.region ?? row.region, named.name ?? row.name);
      if (!teamName) return;
      byTid.set(tid, {tid, name: teamName,
        abbreviation: namePart(named.abbrev ?? row.abbrev),
        players: [], former: []});
    });

    const active = [];
    const formerIndex = new Map();
    const knownIds = new Set();
    await reader.forEachTopLevelArrayItem(file, 'players', player => {
      const pid = integer(player?.pid);
      if (pid === null || pid < 0 || knownIds.has(pid)) return;
      knownIds.add(pid);
      const name = fullName(player.firstName, player.lastName) ||
        namePart(player.name);
      if (!name) return;
      const stats = Array.isArray(player.stats) ? player.stats : [];
      const games = new Map(), earlier = new Set();
      let careerStarted = null, priorTeams = new Set();
      for (const row of stats) {
        if (row?.playoffs) continue;
        const season = integer(row?.season), tid = integer(row?.tid);
        const gp = number(row?.gp) ?? 0;
        if (season !== null && season < year && tid !== null && tid >= 0 && gp > 0) {
          earlier.add(season);
          if (byTid.has(tid)) priorTeams.add(tid);
          if (careerStarted === null || season < careerStarted) careerStarted = season;
        }
        if (season !== year || tid === null || tid < 0 || !byTid.has(tid) || gp <= 0) continue;
        const totals = games.get(tid) || {gp:0,pts:0};
        totals.gp += gp;
        totals.pts += number(row.pts) || 0;
        games.set(tid, totals);
      }
      let tid = [...games.entries()].sort((a,b) =>
        b[1].gp - a[1].gp || a[0] - b[0])[0]?.[0] ?? null;
      if (tid === null && fileYear === year && byTid.has(integer(player.tid)))
        tid = integer(player.tid);
      const draftYear = integer(player.draft?.year);
      const bornYear = integer(player.born?.year);
      const age = bornYear && bornYear >= 1850 && bornYear <= year
        ? year - bornYear : null;
      const experience = careerStarted !== null
        ? year - careerStarted : draftYear !== null && draftYear <= year
          ? year - draftYear : 0;
      if (tid === null) {
        if (priorTeams.size && !player.died &&
            (integer(player.diedYear) === null || integer(player.diedYear) > year)) {
          for (const oldTid of priorTeams) {
            if (!formerIndex.has(oldTid)) formerIndex.set(oldTid, []);
            formerIndex.get(oldTid).push({pid, name, experience, age});
          }
        }
        return;
      }
      const ratings = (Array.isArray(player.ratings) ? player.ratings : [])
        .filter(row => (integer(row?.season) ?? Infinity) <= year)
        .sort((a,b)=>(integer(b.season)||0)-(integer(a.season)||0));
      const ovr = number(ratings[0]?.ovr) ?? 40;
      const teamGames = games.get(tid);
      const ppg = teamGames?.gp ? teamGames.pts / teamGames.gp : 0;
      const score = ovr + Math.min(30, ppg) * .65 +
        Math.min(5, (teamGames?.gp || 0) / 15);
      const record = {pid, name, tid, team: byTid.get(tid).name, age,
        experience, ovr, ppg, score};
      byTid.get(tid).players.push(record);
      active.push(record);
    });
    for (const team of byTid.values()) {
      team.players.sort((a,b)=>a.name.localeCompare(b.name));
      team.former = (formerIndex.get(team.tid) || [])
        .filter(p => !active.some(a => a.pid === p.pid));
      team.former.sort((a,b)=>a.name.localeCompare(b.name));
    }
    return {year, sourceSeason: fileYear, teams: [...byTid.values()].sort((a,b)=>
      a.name.localeCompare(b.name)), players: active};
  }

  const role = (label, person, team) =>
    ({label, name: person.name, pid: person.pid, team: team?.name || person.team});
  function available(story, roster) {
    const people = roster.players, teams = roster.teams;
    switch (story.plan) {
      case 'team': return teams.length >= 1;
      case 'teammates2': return teamCandidates(roster,2).length > 0;
      case 'team3': return teamCandidates(roster,3).length > 0;
      case 'team3veteran': return teamCandidates(roster,3,true).length > 0;
      case 'former2': return teamCandidates(roster,2,false,true).length > 0;
      case 'different2': return teams.filter(t=>t.players.length>0).length >= 2;
      case 'league3': return people.length >= 3;
      case 'veterans3': return people.filter(isVeteran).length >= 3 &&
        distinct(people.filter(isVeteran).map(p=>p.tid)).length >= 2;
      case 'veteran': return people.some(isVeteran);
      case 'young':
      case 'youngStar': return people.some(isYoung);
      default: return people.length > 0;
    }
  }
  function cast(story, roster, rng = Math.random) {
    if (!available(story,roster)) return null;
    const out = {story, participants: [], teams: [], notes: story.caution ? [story.caution] : []};
    const teamById = new Map(roster.teams.map(t=>[t.tid,t]));
    function add(person, label, overrideTeam) {
      const team = overrideTeam || teamById.get(person.tid);
      if (team && !out.teams.some(t=>t.tid===team.tid)) out.teams.push(team);
      out.participants.push(role(label, person, team));
    }
    function addTeam(team) {
      if (team && !out.teams.some(t=>t.tid===team.tid)) out.teams.push(team);
    }
    switch (story.id) {
      case 1: {
        const team = pick(teamCandidates(roster,2),rng);
        const p = chooseUnique(team.players,['any','any'],rng);
        add(p[0],'Player in locker-room fight',team);
        add(p[1],'Teammate in locker-room fight',team);
        break;
      }
      case 2: add(rankPick(roster.players,'veteranStar',rng),'Veteran questioned'); break;
      case 3: {
        const team=pick(teamCandidates(roster,3),rng);
        const p=chooseUnique(team.players,['any','any','any'],rng);
        add(p[0],'Player leading walkout',team);
        add(p[1],'Fellow protester',team);
        add(p[2],'Teammate caught in dispute',team);
        break;
      }
      case 4: add(rankPick(roster.players,'star',rng),'Player arrested'); break;
      case 5: {
        const p=chooseUnique(roster.players,['any','any','any'],rng);
        ['Player reportedly arrested','Player attending party','Another player attending'].forEach((v,i)=>add(p[i],v));
        break;
      }
      case 6: addTeam(pick(roster.teams,rng)); break;
      case 7: {
        const team=pick(teamCandidates(roster,3,true),rng);
        const p=chooseUnique(team.players,['veteran','any','any'],rng);
        add(p[0],'Veteran calling for coach’s removal',team);
        add(p[1],'Player making complaint',team);
        add(p[2],'Second player making complaint',team);
        break;
      }
      case 8: add(rankPick(roster.players,'youngStar',rng),'Young player opposing induction'); break;
      case 9: {
        const p=chooseUnique(roster.players,['any','any','any'],rng);
        ['Player contacted by gambler','Second player questioned','Third player questioned'].forEach((v,i)=>add(p[i],v));
        break;
      }
      case 10: {
        const teams=roster.teams.filter(t=>t.players.length>0);
        const first=pick(teams,rng),second=pick(teams.filter(t=>t.tid!==first.tid),rng);
        add(rankPick(first.players,'star',rng),'Star at center of allegation',first);
        add(rankPick(second.players,'any',rng),'Player from other club',second);
        break;
      }
      case 11: addTeam(pick(roster.teams,rng)); break;
      case 12: add(rankPick(roster.players,'star',rng),'Player accused of striking reporter'); break;
      case 13: {
        const veterans=roster.players.filter(isVeteran);
        const teamIds=distinct(veterans.map(p=>p.tid));
        const tid1=pick(teamIds,rng),tid2=pick(teamIds.filter(tid=>tid!==tid1),rng);
        const a=rankPick(veterans.filter(p=>p.tid===tid1),'star',rng);
        const b=rankPick(veterans.filter(p=>p.tid===tid2),'star',rng);
        const c=rankPick(veterans.filter(p=>p.pid!==a.pid&&p.pid!==b.pid),'veteran',rng);
        [a,b,c].forEach((p,i)=>add(p,['Veteran organizer','Second club representative','Another veteran organizer'][i]));
        break;
      }
      case 14: add(rankPick(roster.players,'any',rng),'Player announcing engagement'); break;
      case 15: add(rankPick(roster.players,'young',rng),'Young player arrested'); break;
      case 16: {
        const team=pick(teamCandidates(roster,2,false,true),rng);
        addTeam(team);
        const p=chooseUnique(team.former,['any','any'],rng);
        add(p[0],'Former player alleging stimulant use',team);
        add(p[1],'Second former player witness',team);
        break;
      }
      case 17: {
        const team=pick(teamCandidates(roster,3),rng);
        const p=chooseUnique(team.players,['any','any','any'],rng);
        add(p[0],'Player joining the protesters',team);
        add(p[1],'Teammate at team appearance',team);
        add(p[2],'Another teammate present',team);
        break;
      }
      case 18: add(rankPick(roster.players,'veteranStar',rng),'Veteran named in complaint'); break;
      default: return null;
    }
    // Owners, coaches, physicians, spouses and reporters are not invented:
    // they remain unnamed because the export lacks their verified identities.
    if ([6,11].includes(story.id))
      out.notes.push('The owner is unnamed because the league export does not include a verified owner identity.');
    if (story.id===7) out.notes.push('The coach is unnamed because no verified coach identity is available.');
    if (story.id===12) out.notes.push('The reporter is unnamed because the export does not include journalists.');
    if (story.id===16) out.notes.push('The physician is unnamed because the export does not include medical staff identities.');
    return out;
  }
  function roll(roster, year = 1968, rng = Math.random) {
    const options = (CATALOGS[year] || []).filter(s=>available(s,roster));
    if (!options.length) return null;
    return cast(pick(options,rng),roster,rng);
  }
  window.DBLStoryGeneratorEngine = Object.freeze({
    catalogs: CATALOGS, buildRoster, available, cast, roll
  });
})();