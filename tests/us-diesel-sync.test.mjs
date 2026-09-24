import assert from "node:assert/strict";
import test from "node:test";
import { fscPerMile, parseDieselPrices, weekDateFromRss } from "../supabase/functions/sync-us-diesel/diesel.mjs";

// Trimmed copy of the EIA RSS as published for the week of 09/21/26.
const RSS = `<?xml version="1.0" encoding="ISO-8859-1" ?><rss version="2.0"><channel>
<item><title>Data For 09/21/26</title><description><![CDATA[<br/>
Regular Gasoline Retail Price	<br/>
(Dollars per Gallon)	 			<br/>
4.478  .. U.S.  				<br/>
3.972 ... Gulf Coast		<br/>
5.600 ... West Coast		<br/>
5.106 ... West Coast less California<br/>
6.003 .... California		<br/>
On-Highway Diesel Fuel Retail Price  <br/>
 (Dollars  per Gallon) 			<br/>
6.529  .. U.S.  				<br/>
6.268  ... East Coast  		<br/>
6.517  ....  New England  	<br/>
6.546  ....  Central Atlantic	<br/>
6.139 ....  Lower Atlantic	<br/>
6.680 ... Midwest			<br/>
6.177 ... Gulf Coast		<br/>
6.340 ... Rocky Mountain	<br/>
7.456 ... West Coast		<br/>
6.791 ... West Coast less California<br/>
8.246 .... California		]]></description></item></channel></rss>`;

test("reads the week the prices refer to", () => {
  assert.equal(weekDateFromRss(RSS), "2026-09-21");
  assert.equal(weekDateFromRss("no date here"), null);
  assert.equal(weekDateFromRss("Data For 02/31/26"), null);
});

test("takes diesel, not gasoline, and keeps overlapping West Coast names apart", () => {
  const prices = parseDieselPrices(RSS);
  assert.equal(Object.keys(prices).length, 11);
  assert.equal(prices["U.S."], 6.529);
  assert.equal(prices["Gulf Coast"], 6.177);
  assert.equal(prices["West Coast"], 7.456);
  assert.equal(prices["West Coast less California"], 6.791);
  assert.equal(prices["California"], 8.246);
  assert.deepEqual(parseDieselPrices("<rss>nothing</rss>"), {});
});

test("maps diesel to the surcharge bracket with an inclusive lower bound", () => {
  const brackets = [
    { diesel_from: 6.1, diesel_to: 6.15, truckload_per_mile: 1 },
    { diesel_from: 6.15, diesel_to: 6.2, truckload_per_mile: 1.01 }
  ];
  assert.equal(fscPerMile(6.177, brackets), 1.01);
  assert.equal(fscPerMile(6.15, brackets), 1.01);
  assert.equal(fscPerMile(6.149, brackets), 1);
  assert.equal(fscPerMile(9.99, brackets), null);
});
