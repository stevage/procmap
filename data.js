const tilebelt = require('@mapbox/tilebelt');
const hash = require("number-generator/lib/murmurhash3_x86_32");
const rng = require("number-generator/lib/aleaRNGFactory")();
const fakeName = require('fake-town-name');
const SimplexNoise = require('simplex-noise')
const simplex = new SimplexNoise('seed');
const seeds = {}
const turf = require('@turf/turf');
function hashSeed(x, y) {
    return hash(`${x}${y}`);
}

function setSeed(seed) {
    rng.setSeed(seed);
}

function setSeedString(s) {
    rng.setSeed(hashSeed(s));
}

function setSeedXY(x, y) {
    setSeed(hashSeed(x, y));
}

function random(seed) {
    return rng.uFloat32()
}

function random0(seed) {
    return rng.uFloat32() - 0.5;
}


const scale = 50; // 50
 
function pointsForBounds([minx, miny, maxx, maxy], clip=true, localScale = scale) {
    const q = t => Math.floor(t * localScale);// / scale;
    const points = [];
    const buffer = 1;
    for (let x = q(minx) - buffer; x <= q(maxx)+buffer; x ++) {
        for (let y = q(miny) - buffer; y <= q(maxy)+buffer; y ++) {
            const [cx, cy] = townCoords(x, y);
            if (clip && (cx < minx || cy < miny || cx >= maxx || cy >= maxy)) {
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

function townCoords(x, y) {
    // function wrap(z, min, max) {
    //     const range = (max - min) * scale;
    //     return (z - min* scale ) % range + min * scale;
    // }
    setSeedXY(x, y);
    const M = 1;
    const coords = [
        (x + random0() * M) / scale, 
        (y + random0() * M + (x % 2) * 0.5) / scale, 
    ];
    return coords;
}

function town([x, y]) {
    const seed = hashSeed(x, y);
    setSeed(seed);
    const props = {
        type: 'town',
        seed,
        name: fakeName({seed}),
        size: Math.ceil(random()*random()*random()*5)
    };
    
    return makePoint(townCoords(x, y), props)
}

/* Make a series of coordinates more wiggle */
function complexify(coords, times, wiggliness) {
    function midpoint(a, b) {
        const l = Math.sqrt((b[0] - a[0]) * (b[0] - a[0]) + (b[1] - a[1])  * (b[1] - a[1]));
        return [
            (b[0] - a[0]) / 2 + a[0] - random0() * l * wiggliness, 
            (b[1] - a[1]) / 2 + a[1] - random0() * l * wiggliness
        ];
    }
    setSeedString(String(coords[0]));
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
    if (times > 1) {
        return complexify(out, times - 1, wiggliness);
    } else {
        return out;
    }
}

function road(townA, townB, complexity) {
    setSeed(townA.properties.seed);
    const minsize = Math.min(townA.properties.size, townB.properties.size);
    const maxsize = Math.max(townA.properties.size, townB.properties.size);
    
    return {
        type: 'Feature',
        properties: {
            type: 'road',
            minsize,
            maxsize,
        }, 
        geometry: {
            type: 'LineString',
            coordinates: complexify([townA.geometry.coordinates, townB.geometry.coordinates], 
                complexity, // 7
                0.4 / (minsize + maxsize) * 2)
        }
    }
}

const dist2 = (a, b) => (b[0] - a[0]) * (b[0] - a[0]) + (b[1] - a[1]) * (b[1] - a[1]) ;
/*
TODO: make roads connect across tile boundaries. I think if we are careful to make each road connection symmetric, and construct
each road in the same direction, then they should end up joining. I hope.
*/
function makeRoads(bounds, zoom) {
    
    /* Determines if two towns should be connected by road */
    function connect(a, b) {
        const d2 = dist2(a.geometry.coordinates, b.geometry.coordinates) * scale * scale;
        const A = 0.75;  //0.75// increase for more towns in general
        const B = 0.25; //0.25// decrease for more bias towards nearby towns connected
        const C = 20; //20// decrease for greater connectivity for large towns
        const maxsize = Math.max(a.properties.size, b.properties.size);
        return random() < A/(d2 + B) + maxsize/C;
    }

    function order(tx1, ty1, tx2, ty2) {
        if (tx1 < tx2 || tx1 === tx2 && ty1 < ty2) {
            return [[tx1, ty1], [tx2, ty2]];
        } else {
            return [[tx2, ty2], [tx1, ty1]];
        }
    }
    const complexity = zoom * 2 - 18 ; // 7
    const roads = [];
    console.log('Road complexity', complexity);
    pointsForBounds(bounds).forEach(([x,y]) => {
        for (let tx = x - 1; tx <= x + 1; tx ++) {
            for (let ty = y - 1; ty <= y + 1; ty ++) {
                if (tx === x && ty === y) {
                    continue;
                }
                // put the towns in consistent order regardless of which is "our" town
                const [town1, town2] = order(x, y, tx, ty).map(town);
                setSeedXY(...town1.geometry.coordinates);

                if (connect(town1, town2)) {
                    roads.push(road(town1, town2, complexity))
                }

            }
        }
    });
    console.log(`${roads.length} roads.`);
    return roads;
}

function makeTowns(bounds) {
    const towns = [];
    pointsForBounds(bounds).forEach(([x,y]) => {        
        towns.push(town([x, y]))
    });
    console.log(`${towns.length} towns.`);
    return towns;
}

function makePolys(bounds, polyScale, type, complexity, ratio = 0.0125, wiggleFactor) {
    
    const s = z => z / polyScale;
    function xy(x, y, dx, dy) {
        setSeedXY(x, y);
        return (x + dx + random0(), y + dy + random0());
    }
    function water(coordinates) {
        const u = turf.combine(turf.unkinkPolygon({
            type: 'Feature',
            properties: {
                type: type,
            },
            geometry: turf.rewind({
                type: 'Polygon',
                coordinates 
            })
        })).features[0];
        u.properties = { type }
        // console.log(u);
        return u;
        ;
    }
    const waters = [];
    const isWater = coord => simplex.noise2D(coord[0]/10, coord[1]/10) + 1 < ratio * 2;
    console.log(`Poly ${type} complexity ${complexity}`);

    pointsForBounds(bounds, false, polyScale).forEach(([x,y]) => {
        setSeedXY(x,y);
        const corners = [[x,y], [x+1,y],[x+1,y+1], [x,y+1]];
        //const cp = [s(x+0.5), s(y+0.5)]
        const cp = [s(x + random()), s(y + random())];
        const W = random() * wiggleFactor;
        //4

        // const [w1, w2, w3, w4] = [simplex.noise2D(x, y), simplex.noise2D(x+1, y), simplex.noise2D(x+1, y+1), simplex.noise2D(x, y+1)];
        if (isWater(corners[0]) && isWater(corners[1]) && isWater(corners[2]) && isWater(corners[3])) {
            waters.push(water([[
                [s(x), s(y)],
                [s(x + 1), s(y)],
                [s(x + 1), s(y + 1)],
                [s(x), s(y+1)],
                [s(x), s(y)]
            ]]));
        } else {
            if (isWater(corners[0]) && isWater(corners[3])){// && !isWater(corners[2]) && !isWater(corners[1])) {
                // left is water, right is not
                waters.push(water([[
                    ...complexify([[s(x), s(y)], cp, [s(x), s(y+1)]], complexity, W),
                    [s(x), s(y)]
                ]]));
            } 
            if (isWater(corners[1]) && isWater(corners[2])){// && !isWater(corners[0]) && !isWater(corners[3])) {
                // right is water, left is not
                waters.push(water([[
                    ...complexify([[s(x+1), s(y)], cp, [s(x+1), s(y+1)]], complexity, W),
                    [s(x+1), s(y)]
                ]]));
            } 
            if (isWater(corners[2]) && isWater(corners[3])){// && !isWater(corners[0]) && !isWater(corners[1])) {
                // up is water, down is not
                waters.push(water([[
                    ...complexify([[s(x), s(y+1)], cp, [s(x+1), s(y+1)]], complexity, W),
                    [s(x), s(y+1)]
                ]]));
            }
            if (isWater(corners[0]) && isWater(corners[1])){// && !isWater(corners[2]) && !isWater(corners[3])) {
                // down is water, up is not
                waters.push(water([[
                    ...complexify([[s(x), s(y)], cp, [s(x+1), s(y)]], complexity, W),
                    [s(x), s(y)]
                ]]));
            }
        }
    });
    return waters;


}

module.exports = function dataForBounds(bounds, zoom) {
    return {
        type: 'FeatureCollection',
        features: [
            ...makeTowns(bounds), 
            ...makeRoads(bounds, zoom), 
            ...makePolys(bounds, 200, 'forest',  zoom - 8, 0.5, 1), // complexity: 4
            ...makePolys(bounds, 30, 'water',zoom - 6, 0.3, 0.5)
        ]
    };
}
