"use client";

import * as Plot from "@observablehq/plot";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PlotFigure, type PlotOptions } from "@/components/charts/PlotFigure";
import { CAT_3, CAT_4, INK_3, RULE } from "@/components/insights/shared";
import { MAP_PALETTE } from "@/components/map/scales";
import { PageGuide, Reading } from "@/components/ui/Reading";
import { InsightsSkeleton } from "@/components/ui/Skeleton";
import { ACTOR_COLOR, OTHER_COLOR } from "@/lib/constants";
import { CLASS_WORD, classWeights, confusion, contributions, countryName, crossEntropy, featureName, initHead, logits, macroF1, meanLoss, predict, softmax, step, train, type ClassifierExample, type ClassifierFile, type Head } from "@/lib/classifier";
import { loadClassifier } from "@/lib/data";
import { fmtDate, fmtPct } from "@/lib/format";
import { typeLabel } from "@/lib/geometry";
import type { Provenance } from "@/lib/provenance";
import { useTheme } from "@/lib/theme";
import { Walkthrough, type Stage } from "./Walkthrough";

const CLASS_COLOR: Record<number, string> = { [-1]: "#5c6069", 0: OTHER_COLOR, 1: CAT_4 };
const LR_OPTIONS = [0.05, 0.2, 0.5, 1.0];
const C_OPTIONS = [0.1, 0.3, 1, 3, 10];
const ITER_MAX = 400;
const short = (s: string | null | undefined, n = 90) => (s ? (s.length > n ? `${s.slice(0, n - 1)}…` : s) : "(no title)");
const f3 = (v: number) => v.toFixed(3);

function cloneHead(h: Head): Head {
  return { w: h.w.map((r) => r.slice()), b: h.b.slice() };
}

/**
 * A classifier, step by step: the pipeline's stance head (multinomial logistic regression on the sentence
 * embeddings, trained by full-batch gradient descent) repeated in the browser on the exported examples, one real
 * record followed through the forward pass, the loss, the gradient, the descent and the decision.
 */
export function ClassifierView() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const theme = useTheme();
  const pal = MAP_PALETTE[theme];
  const [file, setFile] = useState<ClassifierFile | null | undefined>(undefined);
  const [iters, setIters] = useState(ITER_MAX);
  const [lr, setLr] = useState(0.5);
  const [cReg, setCReg] = useState(1);

  useEffect(() => {
    loadClassifier().then(setFile).catch(() => setFile(null));
  }, []);

  const exampleKey = useMemo(() => {
    const fromUrl = params.get("ex");
    if (file && fromUrl && file.examples.some((e) => `${e.id}:${e.a}` === fromUrl)) return fromUrl;
    const first = file?.examples.find((e) => e.split === "train" && e.e) ?? file?.examples[0];
    return first ? `${first.id}:${first.a}` : null;
  }, [file, params]);
  const setExample = useCallback(
    (key: string, stage?: number) => {
      const next = new URLSearchParams(params.toString());
      next.set("ex", key);
      if (stage) next.set("stage", String(stage));
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [params, pathname, router],
  );

  // the training set, the balanced weights and the random start (iteration 0) are shared by the early stages
  const setup = useMemo(() => {
    if (!file) return null;
    const tr = file.examples.filter((e) => e.split === "train");
    const xs = tr.map((e) => e.x);
    const ys = tr.map((e) => file.classes.indexOf(e.y));
    const weights = classWeights(ys, file.classes.length);
    const head0 = initHead(file.features.dim, file.classes.length);
    const lam = 1 / (file.method.C * Math.max(xs.length, 1));
    const loss0 = meanLoss(xs, ys, weights, head0, lam);
    const head1 = cloneHead(head0);
    const first = step(xs, ys, weights, head1, file.method.lr, lam);
    const loss1 = meanLoss(xs, ys, weights, head1, lam);
    return { tr, xs, ys, weights, head0, head1, lam, loss0, loss1, gradNorm: first.gradNorm };
  }, [file]);
  const trained = useMemo(() => (file ? train(file, { iters, lr, C: cReg, every: 10 }) : null), [file, iters, lr, cReg]);

  if (!file || !setup || !trained) {
    if (file === null) {
      return (
        <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
          <p className="eyebrow">Step by step</p>
          <h1 className="serif mt-1 text-2xl font-bold sm:text-4xl">A classifier, step by step</h1>
          <p className="mt-3 text-sm text-ink-2">This release carries no labelled, embedded records yet. The weekly text run embeds and labels the records and the next export writes the examples; the page fills then.</p>
        </div>
      );
    }
    return <InsightsSkeleton />;
  }

  const ex = file.examples.find((e) => `${e.id}:${e.a}` === exampleKey) ?? file.examples[0];
  const k = file.classes.length;
  const yIdx = file.classes.indexOf(ex.y);
  const z0 = logits(ex.x, setup.head0);
  const p0 = softmax(z0);
  const p1 = predict(ex.x, setup.head1);
  const pT = predict(ex.x, trained.head);
  const predicted = file.classes[pT.indexOf(Math.max(...pT))];
  const ho = file.examples.filter((e) => e.split === "held_out");
  const xh = ho.map((e) => e.x);
  const yh = ho.map((e) => file.classes.indexOf(e.y));
  const last = trained.history[trained.history.length - 1];
  const f1Held = macroF1(xh, yh, trained.head, k);
  const conf = confusion(xh, yh, trained.head, k);
  const top = contributions(ex.x, trained.head, pT.indexOf(Math.max(...pT)), 8);
  const pipelineHead = file.head ? { w: file.head.coef, b: file.head.intercept } : null;
  const pPipe = pipelineHead && pipelineHead.w.length === ex.x.length ? predict(ex.x, pipelineHead) : null;
  const actorName = (a: "US" | "CN") => (a === "CN" ? "China" : "the United States");
  const labelSource = file.label_source === "adjudicated" ? "the owner's hand-coded, adjudicated sample" : "the zero-shot model's own labels";
  const nonZero = ex.x.filter((v) => v !== 0).length;
  const embDim = file.features.dim - 4;

  const exampleCard = (e: ClassifierExample) => (
    <div className="rounded-md border-2 border-outline bg-card px-3 py-2 shadow-[2px_2px_0_var(--shadow-hard)]">
      <p className="eyebrow">the example · toward {actorName(e.a)} · {e.split === "train" ? "training set" : "held out"}</p>
      <p className="serif mt-1 text-lg font-bold leading-snug">{e.h ?? "(no title stored)"}</p>
      {e.e && e.e !== e.h && <p className="mt-1 text-sm text-ink-2">{e.e} <span className="text-[11px] text-ink-3">· machine translation, model output</span></p>}
      <p className="mt-1 text-xs text-ink-3">{countryName(e.c)} · {typeLabel(e.t)} · {fmtDate(e.d)} · label: <strong className="text-ink">{CLASS_WORD[e.y]}</strong> toward {actorName(e.a)}{e.y5 !== e.y ? ` (five-point stance ${e.y5 > 0 ? "+" : ""}${e.y5}, collapsed to its sign)` : ""}{e.conf != null ? ` · the labelling model's confidence ${f3(e.conf)}` : ""}</p>
    </div>
  );

  const probFigure = (series: { name: string; p: number[] }[], height = 180) => (
    <PlotFigure
      options={{
        height, marginLeft: 40, marginBottom: 36,
        x: { label: null, domain: file.classes.map((c) => CLASS_WORD[c]) },
        fx: { label: null, domain: series.map((s) => s.name) },
        y: { label: "↑ probability", domain: [0, 1], tickFormat: (v: number) => fmtPct(v, 0) },
        marks: [
          Plot.barY(series.flatMap((s) => file.classes.map((c, i) => ({ name: s.name, cls: CLASS_WORD[c], p: s.p[i], truth: c === ex.y }))), { fx: "name", x: "cls", y: "p", fill: (d: { cls: string; truth: boolean }) => (d.truth ? CAT_4 : CLASS_COLOR[0]), tip: true, title: (d: { name: string; cls: string; p: number; truth: boolean }) => `${d.name}: ${d.cls} ${fmtPct(d.p, 1)}${d.truth ? " (the label)" : ""}` }),
          Plot.text(series.flatMap((s) => file.classes.map((c, i) => ({ name: s.name, cls: CLASS_WORD[c], p: s.p[i] }))), { fx: "name", x: "cls", y: "p", text: (d: { p: number }) => fmtPct(d.p, 0), dy: -8, fontSize: 11, fill: pal.selected }),
        ],
      } as PlotOptions}
      ariaLabel="The probability the head gives each class, the labelled class in green"
      expandable={false}
      glyph="model"
    />
  );

  const curveFigure = (
    <PlotFigure
      options={{
        height: 260, marginLeft: 44,
        x: { label: "iteration →", domain: [0, Math.max(iters, 1)] },
        y: { label: "↑ loss (weighted cross-entropy + penalty)", grid: true },
        marks: [
          Plot.lineY(trained.history, { x: "iter", y: "loss", stroke: CAT_3, strokeWidth: 2, curve: "linear" }),
          Plot.dot(trained.history, { x: "iter", y: "loss", r: 2, fill: CAT_3, tip: true, title: (d: { iter: number; loss: number; train: number | null; heldOut: number | null }) => `iteration ${d.iter}\nloss ${d.loss.toFixed(3)}\ntraining accuracy ${d.train == null ? "—" : fmtPct(d.train, 0)}\nheld-out accuracy ${d.heldOut == null ? "—" : fmtPct(d.heldOut, 0)}` }),
        ],
      } as PlotOptions}
      ariaLabel="The loss over the iterations of gradient descent"
      glyph="model"
    />
  );
  const accFigure = (
    <PlotFigure
      options={{
        height: 220, marginLeft: 44,
        x: { label: "iteration →", domain: [0, Math.max(iters, 1)] },
        y: { label: "↑ accuracy", domain: [0, 1], tickFormat: (v: number) => fmtPct(v, 0), grid: true },
        color: { legend: true, domain: ["training set", "held out"], range: [CAT_4, ACTOR_COLOR.CN] },
        marks: [
          Plot.ruleY([1 / k], { stroke: RULE, strokeDasharray: "3,3" }),
          Plot.lineY(trained.history.flatMap((h) => [{ iter: h.iter, v: h.train, s: "training set" }, { iter: h.iter, v: h.heldOut, s: "held out" }]).filter((d) => d.v != null), { x: "iter", y: "v", stroke: "s", strokeWidth: 2, curve: "linear", tip: true, title: (d: { iter: number; v: number; s: string }) => `${d.s}, iteration ${d.iter}: ${fmtPct(d.v, 0)}` }),
        ],
      } as PlotOptions}
      ariaLabel="Training and held-out accuracy over the iterations"
      glyph="model"
    />
  );
  const contribFigure = (
    <PlotFigure
      options={{
        height: 40 + 24 * top.length, marginLeft: 200,
        x: { label: "contribution to the chosen class's logit →" },
        y: { label: null, domain: top.map((t) => featureName(t.j, file.features.dim)) },
        marks: [
          Plot.barX(top, { y: (t: { j: number }) => featureName(t.j, file.features.dim), x: "value", fill: (t: { value: number }) => (t.value >= 0 ? CAT_4 : CLASS_COLOR[-1]), tip: true, title: (t: { j: number; value: number }) => `${featureName(t.j, file.features.dim)}\ninput ${f3(ex.x[t.j])} × weight difference → ${t.value >= 0 ? "+" : ""}${f3(t.value)}` }),
          Plot.ruleX([0], { stroke: INK_3 }),
        ],
      } as PlotOptions}
      ariaLabel="The eight input dimensions that contributed most to the decision"
      expandable={false}
      glyph="model"
    />
  );
  const vectorFigure = (
    <div>
      <Reading compact asks={`What does the head actually read? One bar per input shows the ${file.features.dim} numbers as they enter the layer, with the four appended flags at the right end.`} how="One bar per input dimension in storage order; the embedding dimensions are purple above zero and green below, the four flags at the right end take a third colour; hover for the value and the name of a flag." />
      <PlotFigure
      options={{
        height: 150, marginLeft: 40,
        x: { label: `input dimension (1–${file.features.dim})`, ticks: 6 }, y: { label: "value", ticks: 4 },
        marks: [Plot.ruleY([0], { stroke: INK_3 }), Plot.rectY(ex.x.map((v, i) => ({ i, v })), { x1: "i", x2: (d: { i: number }) => d.i + 1, y: "v", fill: (d: { i: number; v: number }) => (d.i >= embDim ? ACTOR_COLOR.CN : d.v >= 0 ? CAT_3 : CAT_4), tip: true, title: (d: { i: number; v: number }) => `${featureName(d.i, file.features.dim)}: ${d.v.toFixed(4)}` })],
      } as PlotOptions}
      ariaLabel={`The ${file.features.dim} numbers of the example's input row as bars`}
      expandable={false}
      glyph="model"
      />
      <Reading compact says="The bars carry no readable meaning one by one; what the head learns is a weight for each of them, which is why the decision in the last stage can be traced back to these bars." saysKind="model" />
    </div>
  );

  const pick = (key: string, stage: number, label: string) => <button type="button" className="underline decoration-dotted" onClick={() => setExample(key, stage)}>{label}</button>;
  const byClass = (a: "US" | "CN") => file.classes.map((c) => file.by_class.find((b) => b.actor === a && b.y === c)?.n ?? 0);

  const stages: Stage[] = [
    {
      id: "examples", title: "The examples", kicker: "A classifier learns from labelled records; these are the labels it gets.",
      body: (
        <>
          <p>The pipeline&apos;s stance head is a classifier that reads a record&apos;s embedding and says whether the record is against, neutral or in favour of an actor. It learns from examples: records with a label. This page uses <strong>{file.n} examples</strong> ({file.n_train} to learn from, {file.n_held_out} held out to test on), labelled by <strong>{labelSource}</strong>.</p>
          {file.label_source === "zero_shot" ? (
            <p>That matters: until the owner&apos;s validation sample is coded by hand, the only labels in the release are the zero-shot model&apos;s own, so what is learned here is a student of that model, not of a human reader. The page switches to the hand codes the day they are loaded; the pipeline&apos;s real head is trained only on those.</p>
          ) : (
            <p>These are the pipeline&apos;s own training examples, one per document and applicable actor, with the split it used.</p>
          )}
          <p>Neutral records are few ({byClass("CN")[1]} toward China, {byClass("US")[1]} toward the United States), which is why the head weights each class by its rarity when it learns.</p>
        </>
      ),
      figure: (
        <div className="space-y-3">
          <table className="text-xs">
            <thead><tr className="text-left text-ink-3"><th className="py-1 pr-4 font-semibold">Toward</th>{file.classes.map((c) => <th key={c} className="py-1 pr-4 font-semibold">{CLASS_WORD[c]}</th>)}</tr></thead>
            <tbody>{(["CN", "US"] as const).map((a) => <tr key={a} className="border-t border-rule-2"><td className="py-1 pr-4 font-semibold">{actorName(a)}</td>{byClass(a).map((n, i) => <td key={i} className="py-1 pr-4 font-mono tabular-nums">{n}</td>)}</tr>)}</tbody>
          </table>
          {exampleCard(ex)}
          <p className="text-xs text-ink-3">Change the example: {file.examples.slice(0, 6).map((e, i) => <span key={`${e.id}:${e.a}`}>{i > 0 && " · "}{pick(`${e.id}:${e.a}`, 1, short(e.e ?? e.h, 40))}</span>)} · or any of the {file.n} in stage 6.</p>
        </div>
      ),
    },
    {
      id: "layer", title: "One layer", kicker: `${file.features.dim} inputs, ${k} outputs, ${(file.features.dim * k + k).toLocaleString("en-GB")} numbers to learn.`,
      body: (
        <>
          <p>The input is the record&apos;s {embDim}-number embedding (the vector of <Link href={`/step-by-step/words?doc=${ex.id}`} className="underline">page 1</Link>) with four flags appended: which actor the question is about and whether the text mentions each actor. The head is one layer: a weight for every input and every class, a table of {file.features.dim} × {k} numbers, plus one bias per class.</p>
          <p>The forward pass is a sum: for each class, every input times its weight, plus the bias, gives a <em>logit</em>. Before learning, the weights are small random numbers (normal, standard deviation 0.01) and the biases zero, so the three logits are nearly equal: for this record {z0.map((z) => z.toFixed(3)).join(", ")}.</p>
          <p className="text-xs text-ink-3">The page draws its own random start; it cannot reproduce the pipeline&apos;s generator, so the numbers at iteration 0 differ from the pipeline&apos;s while the method is the same. {nonZero} of the {file.features.dim} inputs are non-zero.</p>
        </>
      ),
      figure: vectorFigure,
    },
    {
      id: "loss", title: "Softmax and the loss", kicker: "Logits become probabilities; the probability of the true label becomes a loss.",
      body: (
        <>
          <p>The softmax turns the {k} logits into probabilities that sum to one: each logit is exponentiated and divided by the total. The loss for one example is the negative log of the probability given to its label: 0 when the head is certain and right, large when it is confident and wrong. For this record the head&apos;s probabilities at the start are {p0.map((v, i) => `${CLASS_WORD[file.classes[i]]} ${fmtPct(v, 1)}`).join(", ")}, the label is <strong>{CLASS_WORD[ex.y]}</strong>, and the loss is <strong>{f3(crossEntropy(p0, yIdx))}</strong> (near log {k} = {Math.log(k).toFixed(3)}, which is what guessing evenly costs).</p>
          <p>The pipeline&apos;s objective is the mean loss over the {setup.xs.length} training examples, each weighted by the rarity of its class, plus an L2 penalty that keeps the weights small (λ = 1 / (C · n) with C = {file.method.C}). At the start it is <strong>{f3(setup.loss0)}</strong>.</p>
        </>
      ),
      figure: (
        <div>
          <Reading compact asks="What does the untrained head believe about this record? Bars of the class probabilities show how close to even guessing the start is, which the loss figure in the text measures." how="One bar per class, its height the probability after the softmax, the labelled class in green; at the start the three should be nearly equal." />
          {probFigure([{ name: "at the start", p: p0 }])}
          <Reading compact says="The green bar is what the loss punishes: the lower it is, the larger the loss, whatever the other two bars do." saysKind="model" />
        </div>
      ),
    },
    {
      id: "gradient", title: "The gradient and a step", kicker: "Which way, and how far, to move every weight so the loss falls.",
      body: (
        <>
          <p>For one layer and this loss the gradient has a closed form: for each example the vector of probabilities minus the one-hot label, times the class weight, divided by n, multiplied into the inputs. A weight connecting an input to a class grows when the head under-predicts that class on records where the input is large, and shrinks when it over-predicts it. The penalty adds λ times the weight itself.</p>
          <p>One step moves every weight against its gradient by the learning rate ({file.method.lr}). On the full training set the mean absolute gradient at the start is {setup.gradNorm.toExponential(2)}; after one step the objective goes from <strong>{f3(setup.loss0)}</strong> to <strong>{f3(setup.loss1)}</strong>, and this record&apos;s probability for its label moves from {fmtPct(p0[yIdx], 1)} to {fmtPct(p1[yIdx], 1)}.</p>
        </>
      ),
      figure: (
        <div>
          <Reading compact asks="What does one step change? The same bars before and after it show how far the probabilities move in a single update of every weight." how="Left the start, right after one step on the full training set; one bar per class, the labelled class in green." />
          {probFigure([{ name: "at the start", p: p0 }, { name: "after one step", p: p1 }])}
          <Reading compact says="A small move is the expected one: the step is the learning rate times a gradient averaged over every training example, and this record is only one of them." saysKind="model" />
        </div>
      ),
    },
    {
      id: "descent", title: "Gradient descent", kicker: `${iters} steps, the loss falling and the accuracy rising, computed as you watch.`,
      body: (
        <>
          <p>Learning is that step repeated. The pipeline takes {file.method.iters} full-batch steps at learning rate {file.method.lr}, and picks C by five-fold cross-validation on the training set. Move the levers to see what each does: too small a learning rate and the loss barely falls in the steps given; too large and it jumps; a small C (strong penalty) keeps the weights near zero and the head near guessing.</p>
          <p>After {iters} steps the loss is <strong>{f3(last.loss)}</strong>, the training accuracy <strong>{last.train == null ? "—" : fmtPct(last.train, 0)}</strong> and the held-out accuracy <strong>{last.heldOut == null ? "—" : fmtPct(last.heldOut, 0)}</strong>{f1Held != null ? <> (macro F1 {f3(f1Held)}, the pipeline&apos;s selection metric)</> : null}. The gap between the two lines is what the head memorised rather than learned: with {setup.xs.length} examples and {(file.features.dim * k).toLocaleString("en-GB")} weights it can fit the training set exactly, which is why the held-out number is the one that counts.</p>
        </>
      ),
      figure: (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-4 text-xs">
            <label className="inline-flex items-center gap-2">Iterations <input type="range" min={0} max={ITER_MAX} step={20} value={iters} onChange={(e) => setIters(Number(e.target.value))} aria-label="Iterations" /> <span className="w-8 font-mono tabular-nums">{iters}</span></label>
            <label className="inline-flex items-center gap-1.5">Learning rate
              <select className="input text-xs" value={lr} onChange={(e) => setLr(Number(e.target.value))}>{LR_OPTIONS.map((v) => <option key={v} value={v}>{v}{v === file.method.lr ? " (the pipeline's)" : ""}</option>)}</select>
            </label>
            <label className="inline-flex items-center gap-1.5">C (inverse penalty)
              <select className="input text-xs" value={cReg} onChange={(e) => setCReg(Number(e.target.value))}>{C_OPTIONS.map((v) => <option key={v} value={v}>{v}{v === file.method.C ? " (default)" : ""}</option>)}</select>
            </label>
          </div>
          <Reading compact asks="Does the loss keep falling, and does what the head learns carry over to records it has not seen? A loss curve and an accuracy curve answer the two questions separately, because a falling loss alone does not." how="Top chart: the objective after every tenth step. Bottom chart: accuracy on the training set and on the held-out records, with the dashed rule at even guessing; the levers above recompute both. The confusion table under them counts the held-out records by label and by prediction." />
          {curveFigure}
          {accFigure}
          <Reading compact says="Watch the gap between the two accuracy lines rather than the loss alone: a training line at the top with a held-out line far below is memorising; and the held-out figure rests on a few dozen records, so it moves in steps." saysKind="model" />
          <div>
            <p className="eyebrow">Held-out confusion after {iters} steps · rows the label, columns the prediction</p>
            <table className="mt-1 text-xs">
              <thead><tr className="text-left text-ink-3"><th className="py-1 pr-4 font-semibold">label ↓ / predicted →</th>{file.classes.map((c) => <th key={c} className="py-1 pr-4 font-semibold">{CLASS_WORD[c]}</th>)}</tr></thead>
              <tbody>{conf.map((row, i) => <tr key={i} className="border-t border-rule-2"><td className="py-1 pr-4 font-semibold">{CLASS_WORD[file.classes[i]]}</td>{row.map((n, j) => <td key={j} className={`py-1 pr-4 font-mono tabular-nums ${i === j ? "font-semibold" : "text-ink-2"}`}>{n}</td>)}</tr>)}</tbody>
            </table>
          </div>
        </div>
      ),
    },
    {
      id: "decision", title: "The decision", kicker: "The trained head reads the record and says which inputs decided it.",
      body: (
        <>
          <p>After {iters} steps the head gives this record {pT.map((v, i) => `${CLASS_WORD[file.classes[i]]} ${fmtPct(v, 1)}`).join(", ")}: it says <strong>{CLASS_WORD[predicted]}</strong>, and the label is <strong>{CLASS_WORD[ex.y]}</strong>{predicted === ex.y ? ", so it agrees" : ", so it disagrees"}{ex.split === "held_out" ? " on a record it never saw while learning" : " on a record it learned from"}.</p>
          <p>A one-layer head is readable: the decision is a sum, so each input&apos;s share of it is its value times the difference between its weight for the chosen class and its average weight. The largest shares are drawn below. An embedding dimension has no meaning by name; what the bars show is whether the decision rests on the text (the embedding) or on the appended flags.</p>
          {pPipe ? <p>The pipeline&apos;s own trained head (codebook {file.head?.codebook_version}, trained on {file.head?.n_train} hand-coded examples) gives {pPipe.map((v, i) => `${CLASS_WORD[file.classes[i]]} ${fmtPct(v, 1)}`).join(", ")}.</p> : <p className="text-xs text-ink-3">No trained head is in the release yet (the pipeline trains one once the hand-coded sample exists); the head above is the page&apos;s own.</p>}
        </>
      ),
      figure: (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <label className="inline-flex items-center gap-1.5">Example
              <select className="input max-w-[22rem] text-xs" value={exampleKey ?? ""} onChange={(e) => setExample(e.target.value)}>
                {file.examples.map((e) => <option key={`${e.id}:${e.a}`} value={`${e.id}:${e.a}`}>{e.split === "held_out" ? "[held out] " : ""}{short(e.e ?? e.h, 60)} · {e.a}</option>)}
              </select>
            </label>
          </div>
          <Reading compact asks="What does the trained head say about this record, and which inputs decided it? Probabilities for the chosen record and one bar per contributing input make the decision traceable, which is the reason a one-layer head was chosen." how="Top: one bar per class for the page's head and, when the release carries one, the pipeline's head beside it, the labelled class in green. Bottom: the eight inputs with the largest share of the chosen class's logit, green pushing toward it and grey against; flags are named, embedding dimensions numbered." />
          {probFigure(pPipe ? [{ name: `this page, ${iters} steps`, p: pT }, { name: "the pipeline's head", p: pPipe }] : [{ name: `after ${iters} steps`, p: pT }])}
          {contribFigure}
          <Reading compact says="When the largest bars are flags, the decision rests on which actor is asked about and whether it is mentioned, rather than on the text; when they are embedding dimensions, it rests on the text in a way no single bar explains." saysKind="model" />
        </div>
      ),
    },
    {
      id: "reading", title: "What this shows and does not", kicker: "A model learning from a model, until the sample is coded.",
      body: (
        <>
          <p><strong>What is real.</strong> The records, their embeddings and the method are the pipeline&apos;s own: the same features, the same balanced weights, penalty, learning rate and number of steps as <span className="font-mono text-xs">scm/text/train.py</span>. The numbers are computed on this page from the shipped rows, so they change with the levers and with the example.</p>
          <p><strong>What the labels are.</strong> {file.label_source === "zero_shot" ? <>The labels are the zero-shot classifier&apos;s, not a reader&apos;s. A head that agrees with them has learned to imitate that model, including its mistakes; nothing here measures whether either is right. The hand-coded sample (drawn, waiting on the owner) is what the pipeline trains and validates on, and the stance figures on the site stay a zero-shot baseline until it exists.</> : <>The labels are the adjudicated hand codes, and the held-out split is the pipeline&apos;s own.</>}</p>
          <p><strong>What it cannot say.</strong> The held-out accuracy rests on {ho.length} records and moves by several points with the split; the random start differs from the pipeline&apos;s; a one-layer head on frozen embeddings is the simplest classifier that could work, chosen so that it can be checked, not because it is the best. The methods page describes the validation plan.</p>
        </>
      ),
    },
  ];

  const provenance: Provenance = {
    title: "A classifier, step by step",
    layer: "model",
    tables: ["doc_embedding", "doc_classification", "validation_sample"],
    ids: [ex.id],
    model: { name: `stance head: multinomial logistic regression on ${file.features.embedding_model ?? "the sentence embedding"} ⊕ actor and mention flags; balanced class weights, L2, full-batch gradient descent, repeated in the browser`, status: file.head ? "the pipeline's trained head is in the release and shown beside the page's" : "no trained head in the release yet; the page trains its own on the exported examples", validation: file.label_source === "zero_shot" ? "labels are the zero-shot model's own; nothing here is validated against hand coding" : "labels are the adjudicated hand codes; held-out split as in the pipeline" },
    glossary: ["zero_shot"],
    explore: { href: `/country/${ex.c}?tab=${ex.t === "news" ? "media" : "politics"}`, label: `Open ${countryName(ex.c)}'s records` },
    caveat: "A head trained on model labels imitates the model; the held-out accuracy rests on a few dozen records.",
  };

  return (
    <Walkthrough
      eyebrow="Step by step · 3"
      title="A classifier, step by step"
      lead={<>How the stance head learns: one layer of weights, the forward pass on a real record, the loss, the gradient, {file.method.iters} steps of descent and the decision it reaches, trained in your browser on {file.n} of the release&apos;s own records.</>}
      layer="model"
      provenance={provenance}
      stages={stages}
      aside={
        <PageGuide
          purpose="Repeats the pipeline's stance head in the browser on the release's own examples: one layer of weights, the forward pass on a real record, the loss, the gradient, the descent and the decision, so the stance labels on the site can be seen being learned."
          read="Move through the seven stages with the rail or the arrow keys; the levers in stage 5 retrain the head as you watch, and the example can be changed in stages 1 and 6. Read the labels' source in the first stage before trusting any accuracy."
          next={[{ href: "/step-by-step/words", label: "From words to geometry" }, { href: "/methodology", label: "Methods and data" }]}
        />
      }
    />
  );
}
