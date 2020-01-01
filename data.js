const tilebelt = require('@mapbox/tilebelt');
const hash = require("number-generator/lib/murmurhash3_x86_32");
const rng = require("number-generator/lib/aleaRNGFactory")();
const fakeName = require('fake-town-name');

const seeds = {}

function hashSeed(x, y) {
    return hash(`${x}${y}`);
}

function setSeed(seed) {
    rng.setSeed(seed);
}

function setSeedXY(x, y) {
    setSeed(hashSeed(x, y));
}

function random(seed) {
    return rng.uFloat32()
}

const scale = 50;
 
function pointsForBounds([minx, miny, maxx, maxy]) {
    const q = t => Math.floor(t * scale);// / scale;
    const points = [];
    for (let x = q(minx); x <= q(maxx); x += 1) {
        for (let y = q(miny); y <= q(maxy); y += 1) {
            const c = town
            if (x < minx * scale || y < miny * scale || x >= maxx * scale || y >= maxy * scale) {
                continue;
            }
            points.push([x,y]);
        }
    };
    return points;
}

function makePoint(coordinates, properties) {
    return {
        type: 'Feature',
        properties,
        geometry: {
            type: 'Point',
            coordinates
        }
    }
}
function town(x, y, [minx, miny, maxx, maxy]) {
    // unsolved problem: by constraining the x/y to the bounding box for a tile, the generated data becomes scale dependent
    // so as we zoom in/out, points near the edges of tiles jump around
    function wrap(z, min, max) {
        const range = (max - min) * scale;
        return (z - min* scale ) % range + min * scale;
    }

    const seed = hashSeed(x, y);
    setSeed(seed);
    const props = {
        type: 'town',
        seed,
        name: fakeName({seed}),
        size: Math.ceil(random()*random()*random()*5)
    };
    const coords = [
        wrap(x + random(), minx, maxx) / scale, 
        wrap(y + random(), miny, maxy) / scale, 
    ];
    // console.log(x, y, props.name);
    return makePoint(coords, props)
}

function road(townA, townB) {
    function complexify(coords) {
        function midpoint(a, b) {
            const l = Math.sqrt((b[0] - a[0]) * (b[0] - a[0]) + (b[1] - a[1])  * (b[1] - a[1]));
            const M = 4;
            return [
                (b[0] - a[0]) / 2 + a[0] - (random() - 0.5) * l / M, 
                (b[1] - a[1]) / 2 + a[1] - (random() - 0.5) * l / M
            ];
        }
        const out = [];
        coords.forEach((coord, i) => {
            out.push(coord);
            const next = coords[i + 1];
            if (next) {
                const mid = midpoint(coord, next);
                out.push(mid);
            }
        });
        // console.log(out);
        return out;
    }
    setSeed(townA.properties.seed);
    return {
        type: 'Feature',
        properties: {
            type: 'road',
            minsize: Math.min(townA.properties.size, townB.properties.size),
            maxsize: Math.max(townA.properties.size, townB.properties.size),
        }, 
        geometry: {
            type: 'LineString',
            coordinates: complexify(complexify(complexify(complexify(complexify(complexify(complexify([townA.geometry.coordinates, townB.geometry.coordinates])))))))
        }
    }
}

function makeRoads(bounds) {
    function connect(a, b) {
        if (a.properties.size === b.properties.size) {
            return true;
        }
        return random() < Math.max(a.properties.size, b.properties.size * 2) / 5
    }
    const roads = [];
    pointsForBounds(bounds).forEach(([x,y]) => {
        setSeedXY(x,y);
        const [a, b, c, d, e] = [town(x-1, y, bounds), town(x, y, bounds), town(x, y-1, bounds), town(x-1, y-1, bounds), town(x-1, y+1, bounds)];
        if (connect(a, b) && /*a.properties.size === b.properties.size && */a.geometry.coordinates[0] < b.geometry.coordinates[0] ) {
            roads.push(road(a, b))
        }
        if (connect(c, b) / 5 && /*b.properties.size === c.properties.size && */c.geometry.coordinates[1] < b.geometry.coordinates[1]) {
            roads.push(road(c, b))
        }
        /*if (d.geometry.coordinates[0] < b.geometry.coordinates[0] && d.geometry.coordinates[1] < b.geometry.coordinates[1]) {
            roads.push(road(d, b))
        }
        if (e.geometry.coordinates[0] < b.geometry.coordinates[0] && e.geometry.coordinates[1] > b.geometry.coordinates[1]) {
            roads.push(road(e, b))
        }*/
    });
    console.log(`${roads.length} roads.`);
    return roads;
}

function makeTowns(bounds) {
    const towns = [];
    pointsForBounds(bounds).forEach(([x,y]) => {        
        towns.push(town(x, y, bounds))
    });
    console.log(`${towns.length} towns.`);
    return towns;
}


module.exports = function dataForBounds(bounds) {
    return {
        type: 'FeatureCollection',
        features: [...makeTowns(bounds), ...makeRoads(bounds)]
    };
}
