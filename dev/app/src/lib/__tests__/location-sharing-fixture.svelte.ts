import {mount} from 'svelte';
import LocationSharingFixture from './LocationSharingFixture.svelte';
const host=document.createElement('div');document.body.replaceChildren(host);
mount(LocationSharingFixture,{target:host});
