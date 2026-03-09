# QA Test Script: AI Prompt Alignment Improvements

## Test Date: ___________
## Tester: ___________

---

## 🎯 **Test Objective**
Validate that the enhanced AI prompts with 6-dimension analysis and variance rules produce higher-quality, more diverse playlists.

---

## ✅ **Pre-Test Checklist**
- [ ] Backend server is running
- [ ] OpenAI API key is configured
- [ ] Spotify credentials are configured
- [ ] App is accessible (not in Figma sandbox)
- [ ] Clear browser cache/localStorage to reset exclusion tracking

---

## 📋 **Test Cases**

### **Test 1: Tier Distribution Validation**
**Goal**: Verify that playlists follow the 30/40/30 tier distribution

**Steps**:
1. Generate a playlist with prompt: `"Nostalgic indie rock for a rainy afternoon"`
2. Open browser DevTools → Console
3. Look for the OpenAI response log showing track tiers
4. Count tracks by tier in the generated playlist

**Expected Results**:
- [ ] ~30% of tracks labeled as "anchor" (familiar songs)
- [ ] ~40% of tracks labeled as "mid-range" (smart picks)
- [ ] ~30% of tracks labeled as "deep cut" (discoveries)
- [ ] All tracks have a "tier" field in the response
- [ ] All tracks have a "mood_fit" explanation

**Actual Results**:
```
Total tracks: _____
Anchor: _____ (____%)
Mid-range: _____ (____%)
Deep cuts: _____ (____%)
```

**Pass/Fail**: ______

---

### **Test 2: Artist Diversity Enforcement**
**Goal**: Verify max 2 tracks per artist rule is enforced

**Steps**:
1. Generate a playlist with prompt: `"90s hip hop classics"`
2. Review the track list
3. Count how many tracks each artist appears in

**Expected Results**:
- [ ] No artist appears more than 2 times
- [ ] At least 6 different artists in a 12-track playlist
- [ ] No obvious repetition (e.g., not all Tupac or all Biggie)

**Actual Results**:
```
Artist with most tracks: __________ (_____ tracks)
Total unique artists: _____
```

**Pass/Fail**: ______

---

### **Test 3: Era/Decade Diversity**
**Goal**: Verify playlists span at least 3 decades (unless era-specific)

**Test 3a - Non-Era-Specific Prompt**:
1. Generate: `"Feel-good summer vibes"`
2. Check the "year" field for each track
3. Count how many decades are represented

**Expected Results**:
- [ ] At least 3 different decades represented
- [ ] Not all tracks from 2020s
- [ ] Mix of classic and contemporary

**Actual Results**:
```
Decades represented: ___________
Oldest track: _____ (year: _____)
Newest track: _____ (year: _____)
```

**Pass/Fail**: ______

**Test 3b - Era-Specific Prompt**:
1. Generate: `"80s synth pop for a retro party"`
2. Check track years

**Expected Results**:
- [ ] Most tracks from 1980-1989
- [ ] Era restriction is honored
- [ ] Still diverse within the decade

**Actual Results**:
```
Tracks from 1980s: _____ / _____
Tracks outside range: _____
```

**Pass/Fail**: ______

---

### **Test 4: Non-English Track Inclusion**
**Goal**: Verify at least 1 non-English track is included where appropriate

**Steps**:
1. Generate 3 different playlists with these prompts:
   - `"Chill late-night driving music"`
   - `"Upbeat workout energy"`
   - `"Melancholic piano ballads"`
2. Review each playlist for non-English tracks

**Expected Results**:
- [ ] At least 1 of the 3 playlists contains a non-English track
- [ ] Non-English track fits the vibe naturally (not forced)
- [ ] Artists are from diverse regions (not all same country)

**Actual Results**:
```
Playlist 1 - Non-English tracks: _____
Playlist 2 - Non-English tracks: _____
Playlist 3 - Non-English tracks: _____
Total: _____ / 3 playlists
```

**Pass/Fail**: ______

---

### **Test 5: Surprising/Unexpected Picks**
**Goal**: Verify inclusion of at least 1 unexpected track that still fits

**Steps**:
1. Generate: `"Sad songs for heartbreak"`
2. Review the playlist
3. Identify if there's at least 1 track that's unexpected but makes sense

**Expected Results**:
- [ ] At least 1 track that isn't an obvious choice (not "Someone Like You", "drivers license", etc. as the ONLY picks)
- [ ] The unexpected track still fits the mood (verified by mood_fit explanation)
- [ ] Mix of obvious and creative choices

**Actual Results**:
```
Unexpected track identified: ___________________________
Does it fit the mood? _____
```

**Pass/Fail**: ______

---

### **Test 6: Prompt Analysis (6 Dimensions)**
**Goal**: Verify the AI is analyzing prompts across 6 dimensions

**Steps**:
1. Generate: `"Intense gym workout heavy metal"`
2. Check server logs (or browser console) for OpenAI request
3. Look at the returned playlist metadata

**Expected Results**:
- [ ] `energy_level` is high (7-10 for "intense workout")
- [ ] `mood_tags` reflect the primary mood (e.g., "aggressive", "powerful", "intense")
- [ ] Tracks match the activity context (suitable for working out)
- [ ] All tracks are high-energy metal/rock genres

**Actual Results**:
```
Energy level returned: _____
Mood tags: ___________________________
Track genres observed: ___________________________
```

**Pass/Fail**: ______

---

### **Test 7: No Repetition Across Sessions**
**Goal**: Verify exclusion list prevents repeated tracks

**Steps**:
1. Generate: `"Calm study music"`
2. Note the first 3 tracks
3. Click "Regenerate" (same prompt)
4. Compare the new playlist to the original

**Expected Results**:
- [ ] 0 tracks repeated from first playlist
- [ ] Second playlist is completely different
- [ ] Quality remains consistent (not degraded by exclusions)

**Actual Results**:
```
Tracks in common: _____ / _____
```

**Pass/Fail**: ______

---

### **Test 8: Explicit Track Count Requests**
**Goal**: Verify dynamic tier calculation for different playlist sizes

**Steps**:
1. Generate: `"Jazz standards, 20 songs"`
2. Check that exactly 20 tracks are returned
3. Verify tier distribution still applies (6 anchor, 8 mid, 6 deep)

**Expected Results**:
- [ ] Exactly 20 tracks returned
- [ ] Tier distribution: ~6 anchor, ~8 mid-range, ~6 deep cuts
- [ ] Quality maintained at larger size

**Actual Results**:
```
Total tracks: _____
Anchor: _____ (expected: ~6)
Mid-range: _____ (expected: ~8)
Deep cuts: _____ (expected: ~6)
```

**Pass/Fail**: ______

---

### **Test 9: Genre Diversity (Unless Restricted)**
**Goal**: Verify genre mixing when prompt allows

**Steps**:
1. Generate: `"Chill evening wind-down"`
2. Review track genres
3. Count how many different genres appear

**Expected Results**:
- [ ] At least 3-4 different genres represented
- [ ] Genres all fit the "chill" vibe
- [ ] Not stuck in one lane (e.g., not all lo-fi hip hop)

**Actual Results**:
```
Genres identified: ___________________________
Genre diversity score: _____ / 5
```

**Pass/Fail**: ______

---

### **Test 10: Refinement Quality (Change Scale)**
**Goal**: Verify refinement follows the change scale guide

**Steps**:
1. Generate: `"Upbeat pop hits"`
2. Refine with: `"Make it more melancholic"`
3. Check how many tracks changed

**Expected Results**:
- [ ] 40-60% of tracks changed (broad mood shift)
- [ ] New tracks fit the melancholic direction
- [ ] Title and description updated to reflect change
- [ ] Change percentage logged in console

**Actual Results**:
```
Original track count: _____
Tracks changed: _____ (____%)
Expected range: 40-60%
```

**Pass/Fail**: ______

---

### **Test 11: Artist-Specific Prompt Handling**
**Goal**: Verify explicit artist requests are honored

**Steps**:
1. Generate: `"Songs like Radiohead and The National"`
2. Review playlist

**Expected Results**:
- [ ] Radiohead and The National both appear in playlist
- [ ] Other similar artists included (e.g., Arcade Fire, Bon Iver)
- [ ] Still follows 2-track-per-artist limit
- [ ] Tier distribution still maintained

**Actual Results**:
```
Radiohead tracks: _____
The National tracks: _____
Similar artists included: ___________________________
```

**Pass/Fail**: ______

---

### **Test 12: Mood Fit Explanations**
**Goal**: Verify all tracks have meaningful mood_fit explanations

**Steps**:
1. Generate any playlist
2. Check the `reason` field (mood_fit) for each track
3. Verify explanations are specific, not generic

**Expected Results**:
- [ ] All tracks have a mood_fit explanation
- [ ] Explanations are specific (not "This track fits the vibe")
- [ ] Explanations reference actual song qualities

**Example Good Explanation**: 
`"The atmospheric guitar layers and Thom Yorke's haunting vocals capture the introspective melancholy perfectly"`

**Example Bad Explanation**: 
`"This song matches the mood"`

**Actual Results**:
```
Tracks with good explanations: _____ / _____
Sample good explanation: ___________________________
```

**Pass/Fail**: ______

---

## 📊 **Overall Test Summary**

| Test | Status | Notes |
|------|--------|-------|
| 1. Tier Distribution | ☐ Pass ☐ Fail | |
| 2. Artist Diversity | ☐ Pass ☐ Fail | |
| 3a. Era Diversity (General) | ☐ Pass ☐ Fail | |
| 3b. Era Restriction | ☐ Pass ☐ Fail | |
| 4. Non-English Tracks | ☐ Pass ☐ Fail | |
| 5. Surprising Picks | ☐ Pass ☐ Fail | |
| 6. 6-Dimension Analysis | ☐ Pass ☐ Fail | |
| 7. No Repetition | ☐ Pass ☐ Fail | |
| 8. Dynamic Track Counts | ☐ Pass ☐ Fail | |
| 9. Genre Diversity | ☐ Pass ☐ Fail | |
| 10. Refinement Change Scale | ☐ Pass ☐ Fail | |
| 11. Explicit Artist Handling | ☐ Pass ☐ Fail | |
| 12. Mood Fit Quality | ☐ Pass ☐ Fail | |

**Total Pass Rate**: _____ / 12

---

## 🐛 **Bugs Found**

| Bug ID | Description | Severity | Steps to Reproduce |
|--------|-------------|----------|-------------------|
| | | ☐ Critical ☐ Major ☐ Minor | |
| | | ☐ Critical ☐ Major ☐ Minor | |

---

## 💡 **Observations & Recommendations**

### What's Working Well:
```
(Note improvements you observed)
```

### Areas for Further Improvement:
```
(Note any weaknesses or edge cases)
```

### Sample Playlists Generated:
```
1. Prompt: "_____________________"
   Quality: ☐ Excellent ☐ Good ☐ Average ☐ Poor
   Notes: _____________________

2. Prompt: "_____________________"
   Quality: ☐ Excellent ☐ Good ☐ Average ☐ Poor
   Notes: _____________________

3. Prompt: "_____________________"
   Quality: ☐ Excellent ☐ Good ☐ Average ☐ Poor
   Notes: _____________________
```

---

## 🔍 **Advanced Validation (Optional)**

### Check Server Logs
Open browser DevTools → Console and verify:
- [ ] System prompt includes "6 dimensions" text
- [ ] System prompt includes "VARIANCE RULES" section
- [ ] System prompt includes tier distribution (30/40/30)
- [ ] OpenAI returns `tier` field for all tracks
- [ ] OpenAI returns `year` field for all tracks
- [ ] Token usage is within expected range (~2000-4000 for 12 tracks)

### Compare Before/After
If you have playlists generated with the old system:
- [ ] New playlists are more diverse (artists, eras, genres)
- [ ] New playlists have fewer "obvious" picks
- [ ] New playlists include more international artists
- [ ] New playlists feel more "curated" vs. "algorithmic"

---

## ✅ **Final Sign-Off**

**Overall Assessment**: ☐ Ready to Ship ☐ Needs Minor Fixes ☐ Needs Major Fixes

**Tester Signature**: _____________________ Date: _____

**Notes for Development Team**:
```
(Any feedback for implementation of next improvements)
```
