import * as Blockly from 'blockly/core'
import { BLOCK_STYLES } from '../blockColours'
import { javascriptGenerator, Order } from 'blockly/javascript'

let REGISTERED = false

export function initPointPlaneDistanceBlock() {
  if (REGISTERED) return
  REGISTERED = true

  Blockly.Blocks.point_plane_distance = {
    init() {
      this.appendDummyInput().appendField('Distance from Point to Plane')
      this.appendValueInput('POINT').setCheck('vector3').appendField('Point:')
      this.appendValueInput('PLANE').setCheck('obj3D').appendField('Plane:')
      this.setInputsInline(false)
      this.setOutput(true, 'obj3D')
      this.setStyle(BLOCK_STYLES.COMPUTE_VECTOR_OPERATIONS)
      this.setTooltip('Compute the distance from any point to any point-normal plane.')
      this.setDeletable(true)
      this.setMovable(true)
    },
  }

  javascriptGenerator.forBlock.point_plane_distance = function (block, generator) {
    const point = generator.valueToCode(block, 'POINT', Order.FUNCTION_CALL) || 'null'
    const plane = generator.valueToCode(block, 'PLANE', Order.FUNCTION_CALL) || 'null'

    const code = `(function(){
    const point = ${point};
    const plane = ${plane};
    if (!point?.isVector3 || !plane?.isObject3D) return null;

    const planePoint = plane.userData?.point?.isVector3 ? plane.userData.point.clone() : null;
    const normalSource = plane.userData?.normalUnit?.isVector3
      ? plane.userData.normalUnit.clone()
      : plane.userData?.normalRaw?.isVector3
        ? plane.userData.normalRaw.clone()
        : null;
    if (!planePoint || !normalSource || normalSource.lengthSq() < 1e-12) return null;

    // Captured before normalize() mutates it: n is drawn at its own magnitude.
    const normalLength = normalSource.length();
    const normalColor = window.GeoScratchColors.forRole('operandB');
    const normal = normalSource.normalize();
    const signedDistance = point.clone().sub(planePoint).dot(normal);
    const distance = Math.abs(signedDistance);
    // The foot of P's own perpendicular, so the bar runs from the plane up to P.
    // It used to start at the plane's defining point A, which is the right
    // length drawn in the wrong place. vector_project does the same thing.
    const distanceStart = point.clone().addScaledVector(normal, -signedDistance);
    const distanceEnd = point.clone();
    const safeLength = Number.isFinite(distance) && distance > 1e-8 ? distance : 1;
    const midpoint = distanceStart.clone().add(distanceEnd).multiplyScalar(0.5);
    const difference = point.clone().sub(planePoint);
    const fmt = vectorNotation.formatVector;

    const pointColor = window.GeoScratchColors.forInstance('point', ${JSON.stringify(block.id)});
    const differenceVectorColor = window.GeoScratchColors.forInstance('vector', ${JSON.stringify(block.id)});
    const distanceColor = window.GeoScratchColors.forRole('warning');

    // The distance construction supplies the one explanatory normal. Keep the
    // plane's defining point, but suppress its built-in duplicate normal arrow.
    plane.traverse?.((child) => {
      if (child.userData?.geoType === 'parametric_plane_normal_arrow') child.visible = false;
    });

    const group = new THREE.Group();
    const pointDot = window.geoPointMarker({ color: pointColor, radius: 0.045 });
    pointDot.position.copy(point);

    const planePointDot = window.geoPointMarker({ color: pointColor, radius: 0.045 });
    planePointDot.position.copy(planePoint);

    let differenceArrow = null;
    if (difference.lengthSq() > 1e-12) {
      differenceArrow = window.buildVectorShaftGlyph(
        THREE, ${JSON.stringify(block.id)} + '_diff', planePoint.clone(),
        difference.clone().normalize(), difference.length(), differenceVectorColor
      );
      differenceArrow.userData.geoType = 'geo_vector';
      differenceArrow.userData.srcBlockId = ${JSON.stringify(block.id)};
    }

    let segment;
    if (distance > 1e-8) {
      segment = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.05, safeLength, 18),
        new THREE.MeshBasicMaterial({ color: distanceColor, transparent: true, opacity: 0.62, depthWrite: false })
      );
      segment.position.copy(midpoint);
      segment.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), distanceEnd.clone().sub(distanceStart).normalize());
    } else {
      segment = window.geoPointMarker({ color: distanceColor, radius: 0.05 });
      segment.position.copy(point);
    }
    segment.userData.geoType = 'distance_segment';
    segment.userData.srcBlockId = ${JSON.stringify(block.id)};
    const built = window.buildDistanceIllustration(THREE, {
      blockId: ${JSON.stringify(block.id)},
      foot: distanceStart,
      normal,
      guideTo: planePoint,
      distanceLength: distance,
      normalColor,
      accentColor: window.GeoScratchColors.forRole('accent'),
      footDotColor: window.GeoScratchColors.forRole('distance'),
      footDot: true,
      store: typeof threeObjStore === 'object' ? threeObjStore : null,
    });
    const illustration = built.group;
    const normalTip = built.normalTip;
    group.add(segment, illustration, pointDot, planePointDot);
    if (differenceArrow) group.add(differenceArrow);

    group.userData.geoType = 'point_plane_distance_projection_magnitude';
    group.userData.srcBlockId = ${JSON.stringify(block.id)};
    group.userData.distance = distance;
    group.userData.point = point.clone();
    group.userData.planePoint = planePoint.clone();
    group.userData.normalUnit = normal.clone();
    group.userData.labelAnchors = {
      distanceMid: { type: 'world', position: [midpoint.x, midpoint.y, midpoint.z] },
      normal: { type: 'world', position: [normalTip.x, normalTip.y, normalTip.z] },
      differenceMid: { type: 'world', position: [
        planePoint.clone().add(point).multiplyScalar(0.5).x,
        planePoint.clone().add(point).multiplyScalar(0.5).y,
        planePoint.clone().add(point).multiplyScalar(0.5).z,
      ] },
    };
    group.userData.labels = [
      {
        anchor: 'differenceMid',
        text: 'P - Q1 = ' + fmt(difference),
        distanceFactor: 8,
        offset: [0.12, 0.12, 0],
        color: differenceVectorColor,
      },
      {
        anchor: 'distanceMid',
        text: 'd = ' + Number(distance.toFixed(3)),
        distanceFactor: 6,
        offset: [0, 0, 0],
        emphasis: true,
        role: 'distance',
        color: distanceColor,
      },
      {
        anchor: 'normal',
        text: 'n',
        distanceFactor: 8,
        offset: [0.14, 0.14, 0],
        emphasis: true,
        color: normalColor,
      },
    ];

    if (typeof threeObjStore === 'object' && threeObjStore) {
      if (differenceArrow) threeObjStore[${JSON.stringify(block.id)} + '_diff'] = differenceArrow;
      threeObjStore[${JSON.stringify(block.id)}] = group;
    }
    return group;
  })()`

    return [code, Order.FUNCTION_CALL]
  }
}

export default initPointPlaneDistanceBlock
