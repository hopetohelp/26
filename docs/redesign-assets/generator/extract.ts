import modelFile from "../../../src/data/model.json";
import { lastPollDate, latestPerPollster, lists2026, listName, passesInAll, meta, polls, usablePolls } from "../../../src/lib/data";
const model: any = modelFile;
const asOf = lastPollDate();
const latest = latestPerPollster(asOf, 14);
const trend0 = model.trend[0].seats;
const rows = Object.keys(model.scenarios.lists).map((id) => ({
  id, name: listName(id), gov: lists2026.find((l) => l.id === id)?.gov37 ?? false,
  central: model.central.seats[id], lo: model.scenarios.lists[id].seats[0], hi: model.scenarios.lists[id].seats[2],
  pass: model.scenarios.lists[id].pass, sure: passesInAll(latest, id), d0: model.central.seats[id] - (trend0[id] ?? 0),
})).sort((a, b) => b.central - a.central || model.scenarios.lists[b.id].share[1] - model.scenarios.lists[a.id].share[1]);
console.log(JSON.stringify({
  asOf: model.asof, start: model.start, polls: model.polls, pollsters: model.pollsters, lastPoll: asOf, latestN: latest.length,
  bloc: model.scenarios.bloc, wasted: model.scenarios.wasted, electionDay: meta.electionDay, dataAsOf: meta.dataAsOf, usable: usablePolls.length, rows,
}, null, 1));
