import * as THREE from "three";

import { Player } from "../Player";

/** Steve skin sheet size */
const SKIN_SIZE = 64;

/** Model is 32 px tall; scaled so it matches the 1.8-block hitbox */
const PX = 0.9 / 16;

/** Height of the hip above the feet, in world units (12 px) */
const HIP_Y = 12 * PX;

/** Per-face shade: +X, -X, +Y, -Y, +Z, -Z (vanilla entity light) */
const FACE_SHADE = [0.6, 0.6, 1.0, 0.5, 0.8, 0.8];

/** A box part of the skin: pixel position and pixel dimensions */
type PartSpec = { u: number; v: number; w: number; h: number; d: number };

const PARTS: Record<string, PartSpec> = {
  head: { u: 0, v: 0, w: 8, h: 8, d: 8 },
  body: { u: 16, v: 16, w: 8, h: 12, d: 4 },
  rightArm: { u: 40, v: 16, w: 4, h: 12, d: 4 },
  leftArm: { u: 32, v: 48, w: 4, h: 12, d: 4 },
  rightLeg: { u: 0, v: 16, w: 4, h: 12, d: 4 },
  leftLeg: { u: 16, v: 48, w: 4, h: 12, d: 4 },
};

/** Sitting pose: legs fold toward the chair front (+Z), arms rest forward */
const SIT_LEG_ANGLE = -1.35;
const SIT_ARM_ANGLE = -0.3;

/**
 * Third-person Steve model: head, body, two arms and two legs built from the
 * skin sheet. Limb groups pivot at shoulder/hip so they can swing when walking
 * and fold forward when sitting.
 */
export class PlayerModel {
  readonly group = new THREE.Group();

  private readonly head: THREE.Mesh;
  private readonly rightArm: THREE.Group;
  private readonly leftArm: THREE.Group;
  private readonly rightLeg: THREE.Group;
  private readonly leftLeg: THREE.Group;

  /** Accumulated walk-cycle phase */
  private phase = 0;
  private readonly tmp = new THREE.Vector3();

  constructor() {
    const skin = new THREE.TextureLoader().load("entity/steve.png");
    skin.magFilter = THREE.NearestFilter;
    skin.minFilter = THREE.NearestFilter;
    skin.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.MeshBasicMaterial({
      map: skin,
      vertexColors: true,
    });

    const box = (name: string) => {
      const spec = PARTS[name];
      const geometry = new THREE.BoxGeometry(
        spec.w * PX,
        spec.h * PX,
        spec.d * PX
      );
      this.applySkinUVs(geometry, spec);
      return new THREE.Mesh(geometry, material);
    };

    this.head = box("head");
    this.head.position.y = 28 * PX;
    this.group.add(this.head);

    const body = box("body");
    body.position.y = 18 * PX;
    this.group.add(body);

    this.rightArm = this.limb("rightArm", 6, 24);
    this.leftArm = this.limb("leftArm", -6, 24);
    this.rightLeg = this.limb("rightLeg", 2, 12);
    this.leftLeg = this.limb("leftLeg", -2, 12);

    this.group.visible = false;
  }

  /** A limb group pivoting at (px, py); the mesh hangs below the pivot */
  private limb(name: string, x: number, y: number): THREE.Group {
    const spec = PARTS[name];
    const pivot = new THREE.Group();
    pivot.position.set(x * PX, y * PX, 0);
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(spec.w * PX, spec.h * PX, spec.d * PX),
      this.head.material as THREE.Material
    );
    this.applySkinUVs(mesh.geometry as THREE.BoxGeometry, spec);
    mesh.position.y = -(spec.h / 2) * PX;
    pivot.add(mesh);
    this.group.add(pivot);
    return pivot;
  }

  setVisible(visible: boolean) {
    this.group.visible = visible;
  }

  /**
   * Positions and poses the model. Standing, it follows the interpolated feet
   * position and swings its limbs with the walk speed; sitting, it is anchored
   * on the seat and folded into a seated pose.
   */
  update(dt: number, player: Player, alpha: number) {
    if (!this.group.visible) return;

    if (player.isSitting) {
      this.group.position.copy(player.seatAnchor);
      this.group.position.y -= HIP_Y;
      this.group.rotation.y = player.seatYaw;
      this.setLimbPose(SIT_LEG_ANGLE, SIT_ARM_ANGLE);
      return;
    }

    this.tmp.lerpVectors(player.prevPos, player.pos, alpha);
    this.group.position.copy(this.tmp);

    const forward = player.camera.getWorldDirection(this.tmp);
    this.group.rotation.y = Math.atan2(forward.x, forward.z);

    const speed = Math.hypot(player.velocity.x, player.velocity.z);
    const amp = Math.min(speed * 9, 0.75);
    this.phase += speed * 90 * dt;
    const swing = Math.sin(this.phase) * amp;
    this.rightLeg.rotation.x = swing;
    this.leftLeg.rotation.x = -swing;
    this.rightArm.rotation.x = -swing;
    this.leftArm.rotation.x = swing;
    this.head.rotation.y = 0;
  }

  private setLimbPose(legAngle: number, armAngle: number) {
    this.rightLeg.rotation.x = legAngle;
    this.leftLeg.rotation.x = legAngle;
    this.rightArm.rotation.x = armAngle;
    this.leftArm.rotation.x = armAngle;
    this.head.rotation.y = 0;
  }

  /** Maps a box's six faces onto the skin cube layout, with baked face shade */
  private applySkinUVs(geometry: THREE.BoxGeometry, spec: PartSpec) {
    const { u, v, w, h, d } = spec;
    const regions: [number, number, number, number][] = [
      [u, v + d, d, h],
      [u + d + w, v + d, d, h],
      [u + d + w, v, w, d],
      [u + d, v, w, d],
      [u + d, v + d, w, h],
      [u + 2 * d + w, v + d, w, h],
    ];
    const uv = geometry.attributes.uv;
    const colors = new Float32Array(geometry.attributes.position.count * 3);
    regions.forEach(([x, y, rw, rh], face) => {
      const corners = [
        [x, y + rh],
        [x + rw, y + rh],
        [x, y],
        [x + rw, y],
      ];
      const shade = FACE_SHADE[face];
      corners.forEach(([cx, cy], i) => {
        uv.setXY(face * 4 + i, cx / SKIN_SIZE, 1 - cy / SKIN_SIZE);
        const o = (face * 4 + i) * 3;
        colors[o] = shade;
        colors[o + 1] = shade;
        colors[o + 2] = shade;
      });
    });
    uv.needsUpdate = true;
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  }
}
