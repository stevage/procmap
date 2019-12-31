const tilebelt = require('@mapbox/tilebelt');
const hash = require("number-generator/lib/murmurhash3_x86_32");
const rng = require("number-generator/lib/aleaRNGFactory")();

const cantor = (x, y) => 0.5 * (x + y) * (x + y + 1) + y;
const seeds = {}
function seedify(x,y) {
    const s = ((x % (2 << 15)) << 16) + (y % (2 << 15))
    if (s === 0) { 
        console.log('0!', x, y);
    }
    if (seeds[s]) {
        // console.warn('Repeated seed!', seeds[s], [x,y]);
    }
    seeds[s] = [x,y];
    return s;
}

function hashSeed(x, y) {
    // return hash(String(seedify(Math.round(x), Math.round(y))));
    return hash(`${x}${y}`);

}

function setSeed(seed) {
    rng.setSeed(seed);
}

function random(seed) {
    return rng.uFloat32()
}

module.exports = function dataForBounds([minx, miny, maxx, maxy]) {
    function wrap(x, min, max) {
        const range = max - min;
        return (x - min) % range + min;
    }

    const scale = 1000;
    const q = t => Math.round(t * scale) / scale;
    const features = [];
    for (let x = q(minx); x < q(maxx); x += 1/ scale) {
        for (let y = q(miny); y < q(maxy); y += 1/ scale) {

            setSeed(hashSeed(x * scale, y * scale));

            let seed2 = String(x) + String(y);
            const coords = [
                wrap(x + random() /100, minx, maxx), 
                wrap(y + random() /100, miny, maxy), 
            ];
            features.push({
                type: 'Feature',
                properties: {},
                geometry: {
                    type: 'Point',
                    coordinates: coords
                }
            })
        }
    }
    console.log(`${features.length} points.`);
    return {
        type: 'FeatureCollection',
        features
    };
}

