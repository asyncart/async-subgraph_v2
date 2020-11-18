open TestFramework;

describe("Assertions", ({test, testAsync}) => {
  test("runs simple tests", ({expect}) => {
    expect.int(1 + 1).toBe(2);
    expect.int(1 + 1 + 1).toBe(3);
    expect.bool(true).toBe(true);
    expect.float(1.0).toBeCloseTo(1.0);
    expect.string("hello").not.toEqual("goodbye");
    expect.string("").toBeEmpty();
    expect.arrayOf(Int, [|1, 2, 3|]).toEqual([|1, 2, 3|]);
    expect.listOf(String, ["a", "b"]).toEqual(["a", "b"]);
    expect.value(Ok(1)).toEqual(Ok(1));
  });

  testAsync("runs async tests", ({expect, callback}) => {
    open Js.Global;
    let _ =
      setTimeout(
        () => {
          expect.int(1 + 1).toBe(2);
          callback();
        },
        0,
      );
    ();
  });

  test("produces snapshots", ({expect}) => {
    expect.string("hello").toMatchSnapshot();
    expect.value({"id": 1}).toMatchSnapshot();
  });
});

describe("Lifecycle", ({test, beforeEach, afterEach}) => {
  let persistentValue = ref(0);

  beforeEach(() => {persistentValue := persistentValue.contents + 1});

  afterEach(() => {persistentValue := persistentValue.contents - 1});

  test("runs lifecycle the first time", ({expect}) => {
    expect.int(persistentValue.contents).toBe(1)
  });

  test("runs lifecycle each time", ({expect}) => {
    expect.int(persistentValue.contents).toBe(1)
  });
});
