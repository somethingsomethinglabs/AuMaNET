<script lang="ts">
  import {onDestroy} from 'svelte';
  import type {NativeGroupClient} from '@aumanet/core';
  export let client:NativeGroupClient;
  export let owner=false;
  export let name='';
  export let invitation='';
  let request='',response='',output='',busy=false,error='',notice='';
  let reviewed:Awaited<ReturnType<NativeGroupClient['reviewOfflineEnrollment']>>|undefined;
  let reviewedCode='';
  let alive=true;
  async function run(action:()=>Promise<void>){if(busy)return;busy=true;error='';notice='';try{await action();}catch{if(alive)error='Setup could not be confirmed. Check the code and its expiry. Keep any approval code and check the saved member list before approving again.';}finally{if(alive)busy=false;}}
  async function prepare(){await run(async()=>{const value=await client.prepareOfflineEnrollment(invitation.trim(),name.trim());if(alive){output=value.requestCode;notice='Give this request to the owner. Your phone identity is saved; you have not connected yet.';}});}
  async function review(){await run(async()=>{const code=request.trim(),value=await client.reviewOfflineEnrollment(code);if(alive){reviewed=value;reviewedCode=code;}});}
  async function approve(){if(!reviewed||reviewedCode!==request.trim())return;const checked=reviewed;await run(async()=>{const value=await client.approveOfflineEnrollment(reviewedCode,checked);if(alive){output=value.approvalCode;notice='Phone approved. Give this approval code to that phone, then finish its node setup over USB.';reviewed=undefined;}});}
  async function accept(){await run(async()=>{await client.acceptOfflineEnrollment(response.trim());if(alive){response='';output='';notice='Membership saved. Finish the checked USB node setup, then use Resume connection. Voice and location remain off.';}});}
  async function copy(){try{await navigator.clipboard.writeText(output);notice='Code copied. Share it privately with the other phone.';}catch{error='Select the code and copy it manually.';}}
  onDestroy(()=>{alive=false;request=response=output=reviewedCode='';reviewed=undefined;});
</script>

{#if client.supportsOfflineEnrollment}
<details class="offline-enrollment"><summary>{owner?'Approve a phone with its own node':'I have my own new node'}</summary>
  <p>This setup exchanges codes before the new node can reach the group. Initial node provisioning currently requires the trusted USB setup tool.</p>
  {#if owner}
    <p>Create a private invitation above and give it to the new member. Paste their signed request here. Check the displayed phone identity with them before approval.</p>
    <label>Member request<textarea aria-label="Offline member request" maxlength="12000" autocomplete="off" spellcheck="false" bind:value={request} oninput={()=>{reviewed=undefined;output='';}}></textarea></label>
    <button class="outline" disabled={busy||!request.trim()} onclick={()=>void review()}>Review phone request</button>
    {#if reviewed}<p><strong>{reviewed.name}</strong></p><output class="fingerprint">{reviewed.selfId}</output><p>Approve this exact phone for the group? Its node will be authorized separately during USB setup.</p><button class="primary" disabled={busy} onclick={()=>void approve()}>Approve this phone</button>{/if}
  {:else}
    <p>Enter your name and the owner’s invitation above, then create a request. Give it to the owner and paste their approval code below. No common Wi-Fi or internet connection is needed for this exchange.</p>
    <button class="outline" disabled={busy||!name.trim()||!invitation.trim()} onclick={()=>void prepare()}>Create phone request</button>
    <label>Owner approval<textarea aria-label="Offline owner approval" maxlength="12000" autocomplete="off" spellcheck="false" bind:value={response}></textarea></label>
    <button class="primary" disabled={busy||!response.trim()} onclick={()=>void accept()}>Save approved membership</button>
  {/if}
  {#if output}<label>{owner?'Approval code for the member':'Phone request for the owner'}<textarea aria-label="Offline enrollment output" readonly value={output} spellcheck="false"></textarea></label><button class="outline" disabled={busy} onclick={()=>void copy()}>Copy code</button><p>Finish this exchange before the invitation expires. Keep this code until the other phone confirms it was saved.</p>{/if}
  {#if busy}<p role="status">Checking setup…</p>{/if}{#if error}<p role="alert">{error}</p>{/if}{#if notice}<p role="status">{notice}</p>{/if}
</details>
{/if}
<style>.offline-enrollment{margin:16px 0;border:1px solid var(--line);border-radius:12px;padding:14px;min-width:0}summary{cursor:pointer;font-weight:600}p{font-size:13px;line-height:1.65}label{display:block;font-size:13px;margin:12px 0}textarea{display:block;box-sizing:border-box;width:100%;min-height:88px;resize:vertical;overflow-wrap:anywhere;margin-top:6px;padding:10px;border:1px solid var(--line);border-radius:9px;background:var(--card);color:inherit}.fingerprint{display:block;overflow-wrap:anywhere;font-size:12px}button{margin:5px 0;max-width:100%}</style>
