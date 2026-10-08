/** הסתרת מפלגה מסקרים ידועים; בחירת גיל מקור באימון ואימות בתקופה מאוחרת. */
import { writeFileSync } from "node:fs";
import { lists2026, usablePolls, seatsIn, type Poll } from "../src/lib/data";
import { estimatePollParty } from "../src/lib/blocEstimates";
const split = "2026-09-01";
const sample = usablePolls.filter(p=>p.end>="2026-01-01" && p.verification?.status!=="mismatch");
interface Trial { id:string; firm:string; date:string; age:number; error:number }
const metric=(xs:Trial[])=>{
 const errors=xs.map(x=>x.error).sort((a,b)=>a-b);
 return {n:xs.length,mae:xs.length?errors.reduce((a,b)=>a+b,0)/xs.length:null,p90:errors.length?errors[Math.ceil(errors.length*.9)-1]:null};
};
const acceptable=(m:ReturnType<typeof metric>,n:number)=>m.n>=n && m.mae!<=1.5 && m.p90!<=3;
const runs=[3,7,14,21].map(maxAgeDays=>{
 const trials:Trial[]=[],beforeConsistency:Trial[]=[];let attempted=0,trainingAttempted=0,validationAttempted=0;
 for(const p of sample) for(const {id} of lists2026){
  const actual=seatsIn(p,id);if(actual===undefined)continue;attempted++;if(p.end<split)trainingAttempted++;else validationAttempted++;
  const values={...p.values};delete values[id];const shadow:Poll={...p,values};
  const e=estimatePollParty(shadow,id,usablePolls,maxAgeDays);if(!e)continue;
  const known=Object.keys(values).reduce((n,k)=>n+(seatsIn(shadow,k)??0),0);
  const trial={id,firm:p.firm,date:p.end,age:Math.max(...e.sources.map(s=>(Date.parse(p.end)-Date.parse(s.date))/86400000)),error:Math.abs(e.value-actual)};
  beforeConsistency.push(trial);
  if(known+e.value>120)continue;
  trials.push(trial);
 }
 return {maxAgeDays,attempted,trainingAttempted,validationAttempted,beforeConsistency:metric(beforeConsistency),rejectedByConsistency:beforeConsistency.length-trials.length,trials,training:metric(trials.filter(t=>t.date<split)),validation:metric(trials.filter(t=>t.date>=split))};
});
// הגיל נבחר לפי אימון בלבד; תקופת האימות אינה משמשת לבחירת גיל טוב יותר.
const selected=runs.filter(r=>acceptable(r.training,100)).sort((a,b)=>b.training.n-a.training.n||a.maxAgeDays-b.maxAgeDays)[0];
if(!selected)throw new Error('אין מדיניות שעוברת בדיקת דיוק באימון');
const byParty=lists2026.map(({id,name})=>({id,name,training:metric(selected.trials.filter(t=>t.id===id&&t.date<split)),validation:metric(selected.trials.filter(t=>t.id===id&&t.date>=split))}));
const allowedIds=byParty.filter(p=>acceptable(p.training,20)&&acceptable(p.validation,10)).map(p=>p.id);
if(!allowedIds.length || !acceptable(selected.validation,100))throw new Error('האימות לא מאפשר להפעיל אומדנים');
const policy={maxAgeDays:selected.maxAgeDays,allowedIds,maxMissingFraction:.5,maxEstimatedSeatFraction:1/3};
writeFileSync('src/lib/blocEstimatePolicy.json',JSON.stringify(policy,null,2)+'\n');
const byFirm=[...new Set(selected.trials.map(t=>t.firm))].map(firm=>({firm,...metric(selected.trials.filter(t=>t.firm===firm))}));
const byAge=[3,7,14,21].map(age=>({upToDays:age,...metric(selected.trials.filter(t=>t.age<=age&&t.age>age-(age===3?3:age===7?4:7)))}));
const report={dataThrough:sample.map(p=>p.end).sort().at(-1),split,qualityLimits:{mae:1.5,p90:3,minTrainingPerParty:20,minValidationPerParty:10},policy,candidates:runs.map(({trials,...r})=>r),byParty,byFirm,byAge};
writeFileSync('docs/bloc-estimates-calibration.json',JSON.stringify(report,null,2)+'\n');
const fmt=(m:ReturnType<typeof metric>)=>`${m.n} בדיקות; שגיאה מוחלטת ממוצעת ${m.mae?.toFixed(2)??'—'}; עשירון עליון ${m.p90??'—'}`;
writeFileSync('docs/bloc-estimates-calibration.md',`# בדיקת השלמת מידע בגושים\n\nמקור: סקרי 2026 עד ${report.dataThrough}, כפי שהם שמורים בריפו. בכל בדיקה מוסתרת מפלגה אחת, והאומדן משווה רק לסקרים שפורסמו לפני תחילת הסקר הנבדק. ערך המפלגה שהוסתר אינו מועבר למנגנון. מקרים שגורמים לסך סקר מעל 120 נדחים.\n\nהגיל נבחר רק באימון (לפני ${split}); אימות נפרד בסקרים מאותו תאריך ואילך. הגיל שנבחר: ${policy.maxAgeDays} ימים. אימון: ${fmt(selected.training)} מתוך ${selected.trainingAttempted} הסתרות. אימות: ${fmt(selected.validation)} מתוך ${selected.validationAttempted} הסתרות. אלה שגיאות בהשלמות שהתקבלו בלבד; ${selected.rejectedByConsistency} מועמדים נדחו עקב סך מעל 120. לפני בדיקת העקביות: ${fmt(selected.beforeConsistency)}.\n\nהשלמה מאושרת רק למפלגה עם לפחות 20 בדיקות באימון ו-10 באימות, שגיאה ממוצעת עד 1.5 מנדטים ועשירון עליון עד 3, בשתי התקופות. בגוש נדרש לפחות חצי הרכב ידוע ולא יותר משליש המנדטים באמצעות השלמה.\n\n| מפלגה | אימון | אימות | השלמה פעילה |\n|---|---|---|---|\n${byParty.map(p=>`| ${p.name} | ${fmt(p.training)} | ${fmt(p.validation)} | ${allowedIds.includes(p.id)?'כן':'לא'} |`).join('\n')}\n\nהדוח המלא, כולל השוואת גילאים ופירוט לפי מכון וגיל מקור, ב-bloc-estimates-calibration.json. שגיאה זו נמדדת בבדיקת הסתרה, ואינה טווח ביטחון. חוסר נתונים בפועל עלול להיות קשור לשינוי בהרכב מפלגות, ולכן התוצאות אינן ערובה לדיוק; אין מיפוי אוטומטי בין שמות והרכבים. שמירה, תוצאות אמת ותחזית אינם מקבלים השלמה מסקרים. מדיניות זו תיבדק מחדש בעת שינוי נתונים, באמצעות אותו סקריפט.\n`);
console.log(JSON.stringify({policy,training:selected.training,validation:selected.validation,candidates:runs.map(r=>({days:r.maxAgeDays,training:r.training,validation:r.validation}))},null,2));
