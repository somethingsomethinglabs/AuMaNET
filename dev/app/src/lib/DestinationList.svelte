<script lang="ts">
  import BrandIcon from './BrandIcon.svelte';
  export let groups:readonly {title:string;rows:readonly {label:string;icon:string;target:string;value?:string}[]}[];
  export let onopen:(target:string)=>void;
</script>
{#each groups as group}
  <section class="destination-group" aria-label={group.title}>
    <h2 class="list-label">{group.title}</h2>
    <div class="destination-list">{#each group.rows as row}<button type="button" class="destination-row" data-settings-category={row.target} onclick={()=>onopen(row.target)}><span class="icon-tile"><BrandIcon name={row.icon}/></span><strong>{row.label}</strong>{#if row.value}<small>{row.value}</small>{/if}<BrandIcon name="chevron" size={16}/></button>{/each}</div>
  </section>
{/each}
