import * as Blockly from 'blockly/core'
import { BLOCK_STYLES } from '../blockColours'
import { javascriptGenerator, Order } from 'blockly/javascript'

let REGISTERED = false

export function initVectorProjectBlock() {
  if (REGISTERED) return
  REGISTERED = true

  Blockly.Blocks['vector_project'] = {
    init() {
      this.appendDummyInput().appendField('Vector Project')
      this.appendValueInput('U').setCheck('vector3').appendField('u:')
      this.appendValueInput('V').setCheck('vector3').appendField('onto ').appendField('v:')
      // Two operand inputs, either of which can hold a whole nested chain.
      // Inline puts them side by side, so a point-plane distance ran off the
      // right of the workspace. External stacks them instead.
      // See docs/architecture/blockly-integration.md#operator-input-layout.
      this.setInputsInline(false)

      this.setOutput(true, 'vector3')
      this.setStyle(BLOCK_STYLES.COMPUTE_VECTOR_OPERATIONS)
      this.setTooltip('Compute projection of u onto v, show it, and return the projection vector')
      this.setDeletable(true)
      this.setMovable(true)
    },
  }

  javascriptGenerator.forBlock['vector_project'] = function (block, g) {
    const u = g.valueToCode(block, 'U', Order.FUNCTION_CALL) || 'null'
    const v = g.valueToCode(block, 'V', Order.FUNCTION_CALL) || 'null'

    const code = `(function(){
    const uVal = ${u};
    const vVal = ${v};
    if (!uVal || !vVal || !uVal.isVector3 || !vVal.isVector3) return null;

    const safeLen = (x) => (isFinite(x) && x > 0 ? x : 1);
    const fmt = vectorNotation.formatVector;
    const uLabel = vectorNotation.getLabel(uVal, 'u');
    const vLabel = vectorNotation.getLabel(vVal, 'v');
    // The point-plane diagram uses the second-operand role for its normal. In
    // the teaching palette that is red, keeping n visually distinct from the
    // yellow perpendicular distance.
    const normalColor = window.GeoScratchColors.forRole('operandB');
    const showOperandLabels = vectorNotation.shouldShowOperandLabels(uVal, vVal);
    const projectionLabel = 'proj ' + uLabel + ' on ' + vLabel;
    const baseId = ${JSON.stringify(block.id)};
    const makeSegment = (start, end, color, radius = 0.022) => {
      const delta = end.clone().sub(start);
      const length = delta.length();
      const segment = new THREE.Mesh(
        new THREE.CylinderGeometry(radius, radius, safeLen(length), 18),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.92, depthWrite: false })
      );
      segment.position.copy(start).add(end).multiplyScalar(0.5);
      if (length > 1e-8) {
        segment.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
      }
      return segment;
    };
    const makeProjectionShadow = (foot) => {
      const shadowGroup = new THREE.Group();
      const footDot = window.geoPointMarker({ color: window.GeoScratchColors.forRole('warning'), radius: 0.04 });
      footDot.position.copy(foot);

      shadowGroup.add(footDot);
      shadowGroup.userData.geoType = 'projection_shadow';
      shadowGroup.userData.srcBlockId=${JSON.stringify(block.id)};
      return shadowGroup;
    };

    // Inputs
    const lenU = uVal.length();
    const lenV = vVal.length();
    const operandAColor = window.GeoScratchColors.forRole('operandA');
    const operandBColor = window.GeoScratchColors.forRole('operandB');
    const resultColor = window.GeoScratchColors.forRole('result');
    const warningColor = window.GeoScratchColors.forRole('warning');
    const distanceColor = window.GeoScratchColors.forRole('warning');

    const arrowU = window.buildVectorShaftGlyph(
      THREE, baseId + '_u', new THREE.Vector3(0,0,0),
      (lenU>0?uVal.clone().normalize():new THREE.Vector3(1,0,0)), safeLen(lenU), operandAColor
    );

    const arrowV = window.buildVectorShaftGlyph(
      THREE, baseId + '_v', new THREE.Vector3(0,0,0),
      (lenV>0?vVal.clone().normalize():new THREE.Vector3(1,0,0)), safeLen(lenV), operandBColor
    );

    // Projection u onto v
    let projObj, projVec=new THREE.Vector3(), projLen=0, projOrigin=new THREE.Vector3(0,0,0);
    const isPointPlaneDistanceProjection = uVal.userData?.geoType === 'point_difference_vector';
    const inputLabel = vectorNotation.getLabel(uVal, 'u');
    const pointEnd = isPointPlaneDistanceProjection && uVal.userData.end?.isVector3
      ? uVal.userData.end.clone()
      : null;
    const denom = vVal.lengthSq();
    if (denom>1e-12) {
      const scale = uVal.dot(vVal) / denom;
      projVec = vVal.clone().multiplyScalar(scale);
      projLen = projVec.length();
      // The foot of P's own perpendicular, so the bar runs from the plane up to
      // P and stays put when Q moves. Anchoring it at Q instead made the bar
      // slide along the plane with Q, which is not what a distance to a plane
      // looks like.
      projOrigin = pointEnd ? pointEnd.clone().sub(projVec) : new THREE.Vector3(0,0,0);
      if (projLen>1e-8) {
        const projTip = projOrigin.clone().add(projVec);
        projObj = isPointPlaneDistanceProjection
          ? window.makeExtendableSegment(
              makeSegment(projOrigin.clone(), projTip.clone(), distanceColor, 0.05),
              projOrigin.clone(),
              projTip.clone()
            )
          : window.buildVectorShaftGlyph(
            THREE, baseId + '_proj', projOrigin.clone(), projVec.clone().normalize(), safeLen(projLen), resultColor
          );
      } else {
        projVec.set(0,0,0);
        projOrigin = pointEnd ? pointEnd.clone() : new THREE.Vector3(0,0,0);
        projObj = window.geoPointMarker({ color: warningColor, radius: 0.04 });
      }
    } else {
      projVec.set(0,0,0);
      projOrigin = pointEnd ? pointEnd.clone() : new THREE.Vector3(0,0,0);
      projObj = window.geoPointMarker({ color: warningColor, radius: 0.04 });
    }

    const tag=(o)=>{o.userData.geoType='geo_vector';o.userData.srcBlockId=baseId;return o;};
    tag(arrowU); tag(arrowV); tag(projObj);
    if (isPointPlaneDistanceProjection) projObj.userData.geoType = 'distance_segment';
    if (isPointPlaneDistanceProjection && projObj.material) {
      projObj.material.opacity = 0.62;
      projObj.material.depthWrite = false;
    }

    // Guide: tip(u) -> tip(proj). Hide it for point-plane distance so it is not mistaken for the distance.
    const uTip = pointEnd ? pointEnd.clone() : uVal.clone();
    const pTip = projOrigin.clone().add(projVec);
    let guideLine = null;
    let projectionShadow = null;
    let distanceIllustration = null;
    let normalLabelTipFromIllustration = null;
    let distanceNormalGlyph = null;
    let distanceRightAngle = null;
    let constructionGuide = null;
    let distanceGlow = null;
    let qPointForGuide = null;
    if (!isPointPlaneDistanceProjection) {
      const guideGeom = new THREE.BufferGeometry().setFromPoints([uTip, pTip]);
      const guideMat  = new THREE.LineBasicMaterial({ color: warningColor, transparent:true, opacity:1 });
      guideLine = new THREE.Line(guideGeom, guideMat);
      guideLine.userData.geoType='geo_helper';
      guideLine.userData.srcBlockId=${JSON.stringify(block.id)};
    } else {
      projectionShadow = makeProjectionShadow(projOrigin);
      qPointForGuide = uVal.userData.start?.isVector3 ? uVal.userData.start.clone() : uTip.clone();
      const illustration = window.buildDistanceIllustration(THREE, {
        blockId: ${JSON.stringify(block.id)},
        foot: projOrigin,
        normal: vVal,
        guideTo: qPointForGuide,
        distanceLength: projLen,
        normalColor,
        accentColor: window.GeoScratchColors.forRole('accent'),
        store: typeof threeObjStore === 'object' ? threeObjStore : null,
      });
      distanceIllustration = illustration.group;
      normalLabelTipFromIllustration = illustration.normalTip;
      distanceNormalGlyph = illustration.normalGlyph;
      distanceRightAngle = illustration.rightAngle;

      // Keep n based at Q. This dashed guide joins P to its perpendicular
      // intersection with that normal line.
      const normalForConstruction = lenV > 1e-12
        ? vVal.clone().normalize()
        : new THREE.Vector3(0, 1, 0);
      const qToP = pointEnd.clone().sub(qPointForGuide);
      const initialProjectionTip = qPointForGuide.clone().addScaledVector(
        normalForConstruction,
        qToP.dot(normalForConstruction)
      );
      constructionGuide = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([pointEnd, initialProjectionTip]),
        new THREE.LineDashedMaterial({
          color: window.GeoScratchColors.forRole('accent'),
          dashSize: 0.28,
          gapSize: 0.18,
          transparent: true,
          opacity: 0.95,
        })
      );
      constructionGuide.computeLineDistances();
      constructionGuide.userData.geoType = 'geo_helper';
      constructionGuide.userData.srcBlockId = ${JSON.stringify(block.id)};
      constructionGuide.material.depthTest = false;
      constructionGuide.renderOrder = 20;
      constructionGuide.visible = false;

      if (projObj.isMesh) {
        distanceGlow = projObj.clone();
        distanceGlow.material = new THREE.MeshBasicMaterial({
          color: distanceColor,
          transparent: true,
          opacity: 0,
          depthTest: false,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        });
        distanceGlow.scale.set(1.7, 1, 1.7);
        distanceGlow.renderOrder = 19;
        distanceGlow.visible = false;
        distanceGlow.userData.geoType = 'distance_glow';
        distanceGlow.userData.srcBlockId = ${JSON.stringify(block.id)};
      }

      // The plane nested in "Show any point on object" already contains its
      // own normal arrow. Once this diagram supplies the red normal, hide that
      // duplicate while retaining the plane's defining point marker.
      const pointOwner = window.threeObjStore?.[uVal.userData?.startBlockId];
      pointOwner?.traverse?.((child) => {
        if (child.userData?.geoType === 'parametric_plane_normal_arrow') child.visible = false;
      });
    }

    const group = new THREE.Group();
    if (isPointPlaneDistanceProjection) {
      if (distanceGlow) group.add(distanceGlow);
      group.add(projObj, projectionShadow, distanceIllustration, constructionGuide);
    } else {
      group.add(arrowU, arrowV, projObj, guideLine);
    }
    group.userData.geoType='geo_vector_group';
    group.userData.srcBlockId=${JSON.stringify(block.id)};

    const normalLabelUnit = lenV > 1e-12 ? vVal.clone().normalize() : new THREE.Vector3(0, 1, 0);
    // The illustration already placed the arrow, clearance and all, so take its
    // tip rather than recomputing the same offset a second way and drifting.
    const normalLabelTip = normalLabelTipFromIllustration
      ?? projOrigin.clone().addScaledVector(normalLabelUnit, lenV > 1e-12 ? lenV : 1);

    // Labels at tips
    group.userData.labelAnchors = {
      uTip:{type:'world', position:[uTip.x,     uTip.y,     uTip.z    ]},
      vTip:{type:'world', position:[vVal.x,     vVal.y,     vVal.z    ]},
      pTip:{type:'world', position:[pTip.x,  pTip.y,  pTip.z ]},
      normal:{type:'world', position:[normalLabelTip.x, normalLabelTip.y, normalLabelTip.z]},
    };
    // A label waits for the arrow it names. See docs/architecture/animation.md#labels-wait-for-their-arrow.
    const shownWith = (obj) => () => !obj || obj.visible !== false;
    group.userData.labels = isPointPlaneDistanceProjection
      ? [
        { anchor:'normal', text:'n', distanceFactor:8, offset:[0.14,0.14,0], color: normalColor, revealed: shownWith(distanceIllustration) },
      ]
      : showOperandLabels
        ? [
        { anchor:'uTip', name: uLabel, value: fmt(uVal), distanceFactor:8, offset:[0.12,0.12,0], color: operandAColor, revealed: shownWith(arrowU) },
        { anchor:'vTip', name: vLabel, value: fmt(vVal), distanceFactor:8, offset:[0.12,0.12,0], color: operandBColor, revealed: shownWith(arrowV) },
        { anchor:'pTip', name: projectionLabel, value: fmt(projVec), distanceFactor:8, offset:[0.12,0.12,0], color: projLen > 1e-8 ? resultColor : warningColor, revealed: shownWith(projObj) },
      ]
        : [
        { anchor:'pTip', name: projectionLabel, value: fmt(projVec), distanceFactor:8, offset:[0.12,0.12,0], color: projLen > 1e-8 ? resultColor : warningColor, revealed: shownWith(projObj) },
      ];

    if (isPointPlaneDistanceProjection && qPointForGuide && pointEnd) {
      const finalNormalTip = normalLabelTip.clone();
      const projectionDirection = projVec.lengthSq() > 1e-12
        ? projVec.clone().normalize()
        : normalLabelUnit.clone();
      let projectionAtQ = qPointForGuide.clone().addScaledVector(
        normalLabelUnit,
        pointEnd.clone().sub(qPointForGuide).dot(normalLabelUnit)
      );
      const rightAngleSize = distanceIllustration?.userData?.rightAngleSize ?? 0.24;
      let constructionGuideProgress = 0;
      let constructionPhase = 'normal';
      let glowActive = false;
      const setSegment = (segment, start, end, authoredLength = null) => {
        const delta = end.clone().sub(start);
        const length = delta.length();
        segment.scale.y = authoredLength > 1e-8 ? length / authoredLength : 1;
        segment.position.copy(start).add(end).multiplyScalar(0.5);
        if (length > 1e-8) {
          segment.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
        }
      };
      const updateConstructionVisibility = () => {
        const showProjection = constructionPhase !== 'normal';
        const guideComplete = constructionGuideProgress >= 0.999;
        projObj.visible = showProjection && guideComplete;
        projectionShadow.visible = showProjection && guideComplete;
        if (distanceGlow) distanceGlow.visible = showProjection && guideComplete && glowActive;
        distanceRightAngle.visible =
          constructionPhase === 'projection' || constructionPhase === 'distance'
            ? guideComplete
            : false;
        constructionGuide.visible = showProjection;
        if (distanceIllustration?.userData?.guideLine) {
          distanceIllustration.userData.guideLine.visible = false;
        }
      };
      group.userData.setDistanceConstructionProgress = (progress) => {
        const t = Math.max(0, Math.min(1, Number(progress) || 0));
        const rawGuideProgress = Math.min(1, t / 0.8);
        const guideProgress = rawGuideProgress * rawGuideProgress * (3 - 2 * rawGuideProgress);
        constructionGuideProgress = rawGuideProgress;
        const translation = qPointForGuide.clone().sub(projOrigin);

        setSegment(projObj, qPointForGuide, projectionAtQ);
        if (distanceGlow) setSegment(distanceGlow, qPointForGuide, projectionAtQ);
        distanceNormalGlyph?.position.copy(translation);
        projectionShadow?.position.copy(translation);

        if (constructionGuide?.geometry) {
          const guideTip = pointEnd.clone().lerp(projectionAtQ, guideProgress);
          constructionGuide.geometry.setFromPoints([pointEnd, guideTip]);
          constructionGuide.computeLineDistances();
        }

        if (distanceRightAngle?.geometry) {
          const corner = projectionAtQ;
          const normalArm = projectionDirection.clone().multiplyScalar(-rightAngleSize);
          const tangentArm = pointEnd.clone().sub(corner);
          tangentArm.addScaledVector(projectionDirection, -tangentArm.dot(projectionDirection));
          if (tangentArm.lengthSq() < 1e-10) tangentArm.copy(distanceIllustration.userData.tangent);
          tangentArm.normalize().multiplyScalar(rightAngleSize);
          distanceRightAngle.position.set(0, 0, 0);
          distanceRightAngle.geometry.setFromPoints([
            corner.clone().add(normalArm),
            corner.clone().add(normalArm).add(tangentArm),
            corner.clone().add(tangentArm),
          ]);
        }

        const movedNormalTip = finalNormalTip.clone().add(translation);
        group.userData.labelAnchors.normal.position = movedNormalTip.toArray();
        group.userData.distanceConstructionMidpoint = qPointForGuide.clone().add(projectionAtQ).multiplyScalar(0.5);
        updateConstructionVisibility();
      };
      group.userData.setDistanceConstructionPhase = (phase) => {
        constructionPhase = phase;
        updateConstructionVisibility();
      };
      group.userData.setDistanceConstructionNormalOrigin = (origin) => {
        if (!origin?.isVector3) return;
        qPointForGuide.copy(origin);
        projectionAtQ = qPointForGuide.clone().addScaledVector(
          normalLabelUnit,
          pointEnd.clone().sub(qPointForGuide).dot(normalLabelUnit)
        );
        const translation = qPointForGuide.clone().sub(projOrigin);
        distanceNormalGlyph?.position.copy(translation);
        const movedNormalTip = finalNormalTip.clone().add(translation);
        group.userData.labelAnchors.normal.position = movedNormalTip.toArray();
        group.userData.setDistanceConstructionProgress(constructionGuideProgress);
      };
      group.userData.setDistanceFinalProgress = (progress) => {
        // The final step keeps the projection construction exactly where it
        // was: P remains joined perpendicularly to n, and d stays on n.
        setSegment(projObj, qPointForGuide, projectionAtQ);
        if (distanceGlow) setSegment(distanceGlow, qPointForGuide, projectionAtQ);
        projectionShadow?.position.copy(qPointForGuide.clone().sub(projOrigin));
        if (constructionGuide?.geometry) {
          constructionGuide.geometry.setFromPoints([pointEnd, projectionAtQ]);
          constructionGuide.computeLineDistances();
        }
        if (distanceRightAngle?.geometry) {
          const corner = projectionAtQ;
          const normalArm = normalLabelUnit.clone().multiplyScalar(-rightAngleSize);
          const tangentArm = pointEnd.clone().sub(corner);
          tangentArm.addScaledVector(normalLabelUnit, -tangentArm.dot(normalLabelUnit));
          if (tangentArm.lengthSq() < 1e-10) {
            tangentArm.copy(distanceIllustration.userData.tangent);
          }
          tangentArm.normalize().multiplyScalar(rightAngleSize);
          distanceRightAngle.position.set(0, 0, 0);
          distanceRightAngle.geometry.setFromPoints([
            corner.clone().add(normalArm),
            corner.clone().add(normalArm).add(tangentArm),
            corner.clone().add(tangentArm),
          ]);
        }
        group.userData.distanceConstructionMidpoint = qPointForGuide
          .clone()
          .add(projectionAtQ)
          .multiplyScalar(0.5);
        updateConstructionVisibility();
      };
      group.userData.setDistanceFinalBlink = (progress) => {
        const active = Number(progress) >= 0;
        const t = Math.max(0, Math.min(1, Number(progress) || 0));
        const pulse = 0.5 + 0.5 * Math.cos(t * Math.PI * 10);
        glowActive = active;
        constructionGuide.material.color.set(window.GeoScratchColors.forRole('accent'));
        constructionGuide.material.opacity = 0.95;
        if (projObj.material) {
          projObj.material.color.set(distanceColor);
          projObj.material.opacity = active ? 0.96 : 0.62;
        }
        if (distanceGlow?.material) {
          distanceGlow.material.opacity = active ? 0.12 + 0.34 * pulse : 0;
          distanceGlow.scale.x = active ? 1.7 + 0.35 * pulse : 1.7;
          distanceGlow.scale.z = active ? 1.7 + 0.35 * pulse : 1.7;
        }
        updateConstructionVisibility();
      };
      const distanceNormalLength = distanceNormalGlyph?.userData?.vectorLength ?? 0;
      group.userData.setDistanceNormalProgress = (progress) => {
        const t = Math.max(0, Math.min(1, Number(progress) || 0));
        distanceNormalGlyph?.userData?.setVectorLength?.(distanceNormalLength * t);
        const animatedTip = qPointForGuide
          .clone()
          .addScaledVector(normalLabelUnit, distanceNormalLength * t);
        group.userData.labelAnchors.normal.position = animatedTip.toArray();
      };
      group.userData.setDistanceConstructionProgress(1);
      group.userData.setDistanceConstructionPhase('distance');
      group.userData.setDistanceNormalProgress(1);
      group.userData.setDistanceFinalProgress(1);
      group.userData.setDistanceFinalBlink(1);
    }

    // Staged reveal: the operands first, then the projection they produce,
    // then the helper geometry that explains it. A point-plane projection has
    // no operand arrows of its own -- the point difference was drawn upstream,
    // so that block's reveal is handed the opening stage.
    // See docs/architecture/animation.md#staged-vector-reveal.
    const orderParts = window.orderRevealParts || ((p) => p);
    const upstream = window.threeObjStore?.[uVal.userData?.glyph?.blockId];
    const upstreamReveal = typeof upstream?.userData?.animate === 'function'
      ? upstream.userData.animate
      : null;
    const projFull = projLen > 1e-8 ? safeLen(projLen) : 0;
    // A point-plane distance sweeps rather than reveals. Growing the pieces in
    // sequence shows the construction; sweeping Q around the plane shows WHY it
    // is the answer -- P - Q stretches and swings while the perpendicular stays
    // put at length d, so the projection is visibly the shortest of them.
    // See docs/architecture/animation.md#sweeping-a-point-instead-of-revealing.
    const buildQSweep = () => {
      const qStart = uVal.userData.start?.isVector3 ? uVal.userData.start.clone() : null;
      const pPoint = pointEnd ? pointEnd.clone() : null;
      if (!qStart || !pPoint || projLen <= 1e-8) return null;

      // Q oscillates along the line through the foot and its own start, rather
      // than circling the foot: a circle keeps |P - Q| constant at
      // sqrt(d^2 + r^2) and shows nothing. Sweeping THROUGH the foot makes
      // |P - Q| shrink to exactly d at quarter progress, where P - Q lies along
      // the perpendicular, and grow again -- the projection visibly being the
      // shortest. cos() puts the resting scene at both progress 0 and 1.
      // The illustration owns normalUnit; the sweep needs its own copy.
      const planeNormal = lenV > 1e-12 ? vVal.clone().normalize() : new THREE.Vector3(0, 1, 0);
      const radial = qStart.clone().sub(projOrigin);
      radial.addScaledVector(planeNormal, -radial.dot(planeNormal));
      const radius = radial.length();
      if (radius < 1e-6) return null;
      const axisA = radial.clone().normalize();
      const axisB = new THREE.Vector3().crossVectors(planeNormal, axisA).normalize();

      const marker = (() => {
        const owner = window.threeObjStore?.[uVal.userData?.startBlockId];
        let found = null;
        owner?.traverse?.((child) => {
          if (!found && child.userData?.geoType === 'selectable_point_marker') found = child;
        });
        return found;
      })();
      const differenceArrow = window.threeObjStore?.[uVal.userData?.glyph?.blockId + '_r'];
      // labelAnchors are plain arrays baked at scene build, so a label sits
      // still unless the sweep rewrites them. LabelDeclutter re-reads them each
      // frame while an animation plays.
      const markerOwner = window.threeObjStore?.[uVal.userData?.startBlockId];
      const differenceGroup = window.threeObjStore?.[uVal.userData?.glyph?.blockId];
      const writeAnchor = (owner, name, point) => {
        const anchor = owner?.userData?.labelAnchors?.[name];
        if (anchor) anchor.position = [point.x, point.y, point.z];
      };

      return (progress) => {
        const angle = (Number(progress) || 0) * Math.PI * 2;
        // An orbit whose diameter runs from Q's resting place to the foot, so
        // it passes through both: Q at progress 0 and 1, the foot at 0.5, where
        // |P - Q| is exactly d. A circle centred ON the foot would instead hold
        // |P - Q| constant and show nothing.
        //
        // The radius breathes rather than staying rigid, which keeps it from
        // looking mechanical. Only even multiples of the base frequency are
        // used, because those are the ones that vanish at progress 0, 0.5 and
        // 1 -- so the variation never disturbs either fixed point.
        const orbit = radius / 2;
        const breathe = 1 + 0.18 * Math.sin(2 * angle) + 0.09 * Math.sin(4 * angle);
        const q = projOrigin.clone()
          .addScaledVector(axisA, orbit)
          .addScaledVector(axisA, orbit * breathe * Math.cos(angle))
          .addScaledVector(axisB, orbit * breathe * Math.sin(angle));

        if (marker) marker.position.copy(q);
        writeAnchor(markerOwner, 'q', q);

        const toP = pPoint.clone().sub(q);
        const toPLen = toP.length();
        if (differenceArrow?.userData?.setVectorSegment && toPLen > 1e-6) {
          differenceArrow.userData.setVectorSegment(q, toP.clone().normalize(), toPLen);
        }
        const guideLineForSweep = distanceIllustration?.userData?.guideLine;
        // The difference label rides the middle of the swinging arrow.
        writeAnchor(differenceGroup, 'rTip', q.clone().add(pPoint).multiplyScalar(0.5));
        if (guideLineForSweep?.geometry) {
          guideLineForSweep.geometry.setFromPoints([projOrigin.clone(), q]);
          guideLineForSweep.computeLineDistances();
        }
      };
    };
    const qSweep = isPointPlaneDistanceProjection ? buildQSweep() : null;
    // A wandering path needs following, not watching go past; the default 1.5s
    // covers the whole out-through-back-through-home trip.
    if (qSweep) qSweep.durationScale = 4;

    group.userData.animate = qSweep || window.makeStagedVectorReveal(
      isPointPlaneDistanceProjection
        ? [
          ...(upstreamReveal ? [{ animate: upstreamReveal }] : []),
          { obj: projObj, full: projFull },
          { objs: [projectionShadow, distanceIllustration], full: 1 },
        ]
        : [
          ...orderParts([
            { obj: arrowU, full: safeLen(lenU), anchor: [0,0,0], tip: uVal.toArray() },
            { obj: arrowV, full: safeLen(lenV), anchor: [0,0,0], tip: vVal.toArray() },
          ]),
          { obj: projObj, full: projFull },
          { objs: [guideLine], full: 1 },
        ]
    );

    if (typeof threeObjStore==='object' && threeObjStore){
      const base=${JSON.stringify(block.id)};
      if (!isPointPlaneDistanceProjection) {
        threeObjStore[base + '_u']     = arrowU;
        threeObjStore[base + '_v']     = arrowV;
        threeObjStore[base + '_guide'] = guideLine;
      }
      if (!isPointPlaneDistanceProjection) {
        threeObjStore[base + '_proj'] = projObj;
      }
      threeObjStore[base]            = group;
    }
    const resultVector = projVec.clone();
    if (isPointPlaneDistanceProjection) {
      const labelSide = uTip.clone().sub(projOrigin);
      const normalUnitForLabel = lenV > 1e-12 ? vVal.clone().normalize() : new THREE.Vector3(0, 1, 0);
      labelSide.addScaledVector(normalUnitForLabel, -labelSide.dot(normalUnitForLabel));
      if (labelSide.lengthSq() < 1e-10) labelSide.set(1, 0, 0);
      labelSide.normalize().multiplyScalar(-1);
      vectorNotation.setVectorMetadata(resultVector, {
        geoType: 'point_plane_distance_projection_vector',
        start: projOrigin.clone(),
        end: pTip.clone(),
        labelSide,
        label: 'proj(' + inputLabel + ' onto n)',
      });
    } else {
      vectorNotation.setVectorMetadata(resultVector, {
        geoType: 'named_vector_expression',
        label: projectionLabel,
      });
    }
    // Lets a consumer hand its animation stage to this block's own reveal
    // instead of growing a copy of the result. Carries no anchor on purpose:
    // an anchor is what switches on vectorArithmetic's coincident-copy
    // suppression, a separate decision from whether a reveal can be delegated.
    resultVector.userData = resultVector.userData || {};
    resultVector.userData.glyph = { blockId: ${JSON.stringify(block.id)} };
    return resultVector;
  })()`

    return [code, Order.FUNCTION_CALL]
  }
}
