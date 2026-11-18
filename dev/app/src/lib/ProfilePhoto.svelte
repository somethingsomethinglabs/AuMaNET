<script lang="ts">
  export let photoBase64: string | undefined = undefined;
  let failed: string | undefined;
</script>

{#if photoBase64 && photoBase64 !== failed}
  {#key photoBase64}
    {@const image = photoBase64}
    <img src={'data:image/jpeg;base64,' + image} alt="" onerror={() => failed = image}/>
  {/key}
{:else}
  <slot/>
{/if}

<style>
  img { display: block; width: 100%; height: 100%; border-radius: 50%; object-fit: cover; }
</style>
