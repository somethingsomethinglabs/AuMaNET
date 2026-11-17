<script lang="ts">
  import BenchmarkComparison from '../BenchmarkComparison.svelte';
  import type {ComparedBenchmark} from '../benchmark-comparison';
  export let results:readonly ComparedBenchmark[]=[];
  export let dark=false;
</script>
<main class="app-shell comparison-fixture" class:dark><h1>Benchmark comparison fixture</h1><p>Synthetic data only; no phones, radio or GPS.</p><BenchmarkComparison {results}/></main>
<style>.comparison-fixture{height:auto;min-height:100dvh;padding:16px;max-width:700px;margin:auto;--ink:#174d35;--muted:#65745f;--card:#fffdf6;--line:#dfe1d5;--bg:#f7f5eb;background:var(--bg);color:var(--ink)}.comparison-fixture.dark{--ink:#e8efdf;--muted:#b9c6b5;--card:#20362b;--line:#4f6255;--bg:#16291f}h1{font-size:21px}main>p{font-size:12px}</style>
