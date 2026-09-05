import assert from 'node:assert/strict';
import { communityResidenceFromAddress, isCommunityResidenceAddress } from '../src/lib/deliveryResidence.ts';

const emas = 'Residensi Emas, Jalan Zamrud 2, Sungai Tangkas, 43000 Kajang, Selangor';
const rimbunVariant = 'Rimbun Residence, Jalan Zamrud Utama, Sungai Tangkas, Kajang';
const nearbyRoadOnly = 'No. 12, Jalan Zamrud 2, Sungai Tangkas, 43000 Kajang, Selangor';
const zamrudSuggestion = 'Residensi Zamrud Blok C&D, Jalan Zamrud Utama, Kajang, Selangor';
const zamrudResolvedRoad = 'Jln Zamrud Utama, 43500 Kajang, Selangor';
const canopyHills = 'Canopy Hills 2, Jalan Zamrud Utama, Kajang, Selangor';
const canopyHillResidence = 'canopy hill residence, Jalan Zamrud Utama, Kajang, Selangor';
const canopyHillsSalesGallery = 'Canopy Hills 2 Sales Gallery, Bangi, Selangor';

assert.equal(communityResidenceFromAddress(emas)?.zoneCode, 'residensi_emas');
assert.equal(isCommunityResidenceAddress('RESIDENSI-EMAS, JALAN ZAMRUD 2, KAJANG'), true);
assert.equal(communityResidenceFromAddress(rimbunVariant)?.zoneCode, 'residensi_rimbun');
assert.equal(communityResidenceFromAddress(zamrudResolvedRoad, zamrudSuggestion)?.zoneCode, 'residensi_zamrud');
assert.equal(isCommunityResidenceAddress(zamrudResolvedRoad, zamrudSuggestion), true);
assert.equal(communityResidenceFromAddress(canopyHills)?.zoneCode, 'residensi_rimbun');
assert.equal(communityResidenceFromAddress(canopyHillResidence)?.zoneCode, 'residensi_rimbun');
assert.equal(isCommunityResidenceAddress(canopyHillsSalesGallery), false);
assert.equal(isCommunityResidenceAddress(nearbyRoadOnly), false);
assert.equal(isCommunityResidenceAddress('Jalan Zamrud Utama, Sungai Tangkas, Kajang'), false);

console.log('Community residence eligibility checks passed.');
