import assert from "node:assert/strict";
import { test } from "node:test";
import type { CarnetStanding, ErasureSnapshot } from "../domain/erasure.js";
import type {
  ExportArchive,
  PrivacyRepository,
  StoredFile,
} from "../ports.js";
import { FakeImageStore, FakeLogger } from "../testing/fakes.js";
import { PrivacyService } from "./privacy-service.js";

/* Emporter et partir, vérifiés sans base ni disque : la confirmation exigée, la
   porte de l'administrateur, et l'ORDRE — les fichiers avant les lignes. */

const ARCHIVE = { format: "racontine.export.v1" } as ExportArchive;

/**
 * Dépôt en mémoire qui RETIENT L'ORDRE des gestes. C'est tout l'intérêt de la
 * doublure ici : la garantie qu'on veut prouver n'est pas « ça efface », c'est
 * « ça efface dans cet ordre-là ».
 */
class FakePrivacyRepo implements PrivacyRepository {
  readonly steps: string[] = [];

  constructor(
    private readonly state: {
      archive?: ExportArchive | null;
      snapshot?: ErasureSnapshot | null;
      standing?: CarnetStanding | null;
      files?: StoredFile[];
      staged?: StoredFile[];
    } = {},
  ) {}

  async exportFor(): Promise<ExportArchive | null> {
    return this.state.archive === undefined ? ARCHIVE : this.state.archive;
  }
  async erasureSnapshot(): Promise<ErasureSnapshot | null> {
    return this.state.snapshot === undefined
      ? { isOwner: false, otherAccounts: 1, carnets: [], activeSubscription: false }
      : this.state.snapshot;
  }
  async standingOn(): Promise<CarnetStanding | null> {
    return this.state.standing ?? null;
  }
  async filesOfChildren(childIds: string[]): Promise<StoredFile[]> {
    this.steps.push(`lit-fichiers:${childIds.join(",")}`);
    return this.state.files ?? [];
  }
  async stagedFilesOf(): Promise<StoredFile[]> {
    return this.state.staged ?? [];
  }
  async deleteChildren(childIds: string[]): Promise<void> {
    this.steps.push(`efface-carnets:${childIds.join(",")}`);
  }
  async deleteAccount(userId: string): Promise<void> {
    this.steps.push(`efface-compte:${userId}`);
  }
}

function standing(over: Partial<CarnetStanding> = {}): CarnetStanding {
  return {
    childId: "child-1",
    childName: "Lou",
    role: "admin",
    admins: 1,
    members: 1,
    ...over,
  };
}

function build(state: ConstructorParameters<typeof FakePrivacyRepo>[0] = {}) {
  const repo = new FakePrivacyRepo(state);
  const images = new FakeImageStore();
  const logger = new FakeLogger();
  return {
    repo,
    images,
    logger,
    service: new PrivacyService({ privacy: repo, images, logger }),
  };
}

/* -------------------------------- Emporter ------------------------------- */

test("l'export rend l'archive du compte", async () => {
  const { service } = build();
  assert.equal(await service.exportAccount("u1"), ARCHIVE);
});

test("un compte disparu n'a pas d'archive (404, pas 500)", async () => {
  const { service } = build({ archive: null });
  assert.equal(await service.exportAccount("u1"), null);
});

/* ---------------------------- Effacer un carnet -------------------------- */

test("effacer un carnet exige d'en recopier le prénom", async () => {
  const { service, repo } = build({ standing: standing() });
  const result = await service.deleteCarnet({
    userId: "u1",
    childId: "child-1",
    confirmation: "Anouk",
  });
  assert.equal(result.ok, false);
  assert.ok(!result.ok);
  assert.equal(result.httpCode, 400);
  assert.equal(result.code, "confirmation");
  // Et surtout : RIEN n'a bougé.
  assert.deepEqual(repo.steps, []);
});

test("le prénom recopié efface le carnet : fichiers puis lignes", async () => {
  const { service, repo, images } = build({
    standing: standing(),
    files: [{ originalPath: "2026/02/a.jpg", thumbPath: "2026/02/a_thumb.jpg" }],
  });
  const result = await service.deleteCarnet({
    userId: "u1",
    childId: "child-1",
    confirmation: "lou", // la casse et les espaces sont tolérés
  });
  assert.ok(result.ok);
  assert.equal(result.name, "Lou");
  assert.deepEqual(images.deleted, ["2026/02/a.jpg"]);
  assert.deepEqual(repo.steps, [
    "lit-fichiers:child-1",
    "efface-carnets:child-1",
  ]);
});

test("un contributeur ne peut pas effacer le carnet, et ne l'apprend pas", async () => {
  // Même 404 que pour un carnet inexistant : la réponse ne doit pas révéler
  // qu'il y a bien un carnet derrière cette adresse.
  const { service, repo } = build({ standing: standing({ role: "contributor" }) });
  const result = await service.deleteCarnet({
    userId: "u1",
    childId: "child-1",
    confirmation: "Lou",
  });
  assert.ok(!result.ok);
  assert.equal(result.httpCode, 404);
  assert.deepEqual(repo.steps, []);
});

test("un carnet hors du cercle rend le même 404", async () => {
  const { service } = build({ standing: null });
  const result = await service.deleteCarnet({
    userId: "u1",
    childId: "inconnu",
    confirmation: "Lou",
  });
  assert.ok(!result.ok);
  assert.equal(result.httpCode, 404);
});

/* ---------------------------- Effacer son compte ------------------------- */

test("effacer son compte exige de recopier SON adresse", async () => {
  const { service, repo } = build();
  const result = await service.deleteAccount({
    userId: "u1",
    email: "papa@exemple.fr",
    confirmation: "SUPPRIMER",
  });
  assert.ok(!result.ok);
  assert.equal(result.httpCode, 400);
  assert.equal(result.code, "confirmation");
  assert.deepEqual(repo.steps, []);
});

test("un refus du domaine remonte en 409, avec son code et ses carnets", async () => {
  const { service, repo } = build({
    snapshot: {
      isOwner: false,
      otherAccounts: 1,
      activeSubscription: false,
      carnets: [
        { childId: "c1", childName: "Lou", role: "admin", admins: 1, members: 4 },
      ],
    },
  });
  const result = await service.deleteAccount({
    userId: "u1",
    email: "papa@exemple.fr",
    confirmation: "papa@exemple.fr",
  });
  assert.ok(!result.ok);
  assert.equal(result.httpCode, 409);
  assert.equal(result.code, "sole_admin");
  assert.deepEqual(result.carnets, [{ id: "c1", name: "Lou" }]);
  assert.deepEqual(repo.steps, []);
});

test("le compte part avec les carnets que personne d'autre ne tenait", async () => {
  const { service, repo, images } = build({
    snapshot: {
      isOwner: false,
      otherAccounts: 1,
      activeSubscription: false,
      carnets: [
        { childId: "c1", childName: "Lou", role: "admin", admins: 1, members: 1 },
        { childId: "c2", childName: "Anouk", role: "reader", admins: 2, members: 5 },
      ],
    },
    files: [{ originalPath: "p1.jpg", thumbPath: null }],
  });
  const result = await service.deleteAccount({
    userId: "u1",
    email: "papa@exemple.fr",
    confirmation: " PAPA@exemple.fr ",
  });
  assert.ok(result.ok);
  assert.deepEqual(result.carnets, [{ id: "c1", name: "Lou" }]);
  // Le carnet partagé (c2) n'est pas touché : on s'en retire, il reste aux autres.
  assert.deepEqual(repo.steps, [
    "lit-fichiers:c1",
    "efface-carnets:c1",
    "efface-compte:u1",
  ]);
  assert.deepEqual(images.deleted, ["p1.jpg"]);
});

test("les fichiers mis en attente par MCP partent avec le compte", async () => {
  // Ils ne pendent à aucun carnet : sans ce balayage, ils survivraient sur le
  // disque à la ligne qui disait à qui ils appartenaient.
  const { service, images } = build({
    staged: [{ originalPath: "staging/x.bin", thumbPath: null }],
  });
  const result = await service.deleteAccount({
    userId: "u1",
    email: "papa@exemple.fr",
    confirmation: "papa@exemple.fr",
  });
  assert.ok(result.ok);
  assert.deepEqual(images.deleted, ["staging/x.bin"]);
});

test("un fichier qu'on n'arrive pas à effacer n'empêche pas le compte de partir", async () => {
  // Un disque en lecture seule ne doit pas retenir quelqu'un qui s'en va. La
  // ligne part, et l'échec se voit dans le journal d'exploitation.
  const { service, repo, images, logger } = build({
    staged: [{ originalPath: "staging/x.bin", thumbPath: null }],
  });
  images.delete = async () => {
    throw new Error("disque en lecture seule");
  };
  const result = await service.deleteAccount({
    userId: "u1",
    email: "papa@exemple.fr",
    confirmation: "papa@exemple.fr",
  });
  assert.ok(result.ok);
  assert.deepEqual(repo.steps, ["efface-compte:u1"]);
  assert.deepEqual(logger.errors, ["Fichier non effacé"]);
});

/* -------------------------------- L'aperçu ------------------------------- */

test("l'aperçu annonce ce qui part et ce qui reste, sans rien toucher", async () => {
  const { service, repo } = build({
    snapshot: {
      isOwner: false,
      otherAccounts: 1,
      activeSubscription: false,
      carnets: [
        { childId: "c1", childName: "Lou", role: "admin", admins: 1, members: 1 },
        { childId: "c2", childName: "Anouk", role: "reader", admins: 2, members: 5 },
      ],
    },
  });
  const preview = await service.erasurePreview("u1");
  assert.ok(preview.ok);
  assert.deepEqual(preview.deletes, [{ id: "c1", name: "Lou" }]);
  assert.deepEqual(preview.leaves, [{ id: "c2", name: "Anouk" }]);
  assert.deepEqual(repo.steps, []);
});

test("l'aperçu porte le MÊME refus que le geste — sinon il mentirait", async () => {
  const blocked: ErasureSnapshot = {
    isOwner: true,
    otherAccounts: 2,
    activeSubscription: false,
    carnets: [],
  };
  const { service } = build({ snapshot: blocked });
  const preview = await service.erasurePreview("u1");
  assert.ok(!preview.ok);
  assert.equal(preview.code, "instance_owner");

  const done = await service.deleteAccount({
    userId: "u1",
    email: "papa@exemple.fr",
    confirmation: "papa@exemple.fr",
  });
  assert.ok(!done.ok);
  assert.equal(done.code, preview.code);
});

test("un compte disparu entre l'écran et le bouton rend 404, pas une erreur", async () => {
  const { service } = build({ snapshot: null });
  const result = await service.deleteAccount({
    userId: "u1",
    email: "papa@exemple.fr",
    confirmation: "papa@exemple.fr",
  });
  assert.ok(!result.ok);
  assert.equal(result.httpCode, 404);
});
