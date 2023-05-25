"use strict";
export const validate = validate57;
export default validate57;
const schema29 = {
  properties: { globalCssFiles: { elements: { type: "string" } } },
  optionalProperties: { include: { elements: { type: "string" } }, exclude: { elements: { type: "string" } } },
};
function validate57(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  let valid0 = false;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    valid0 = true;
    var valid1;
    if (data.globalCssFiles !== undefined) {
      let data0 = data.globalCssFiles;
      const _errs0 = errors;
      let valid2 = false;
      if (!valid2) {
        if (Array.isArray(data0)) {
          var valid3 = true;
          const len0 = data0.length;
          for (let i0 = 0; i0 < len0; i0++) {
            const _errs1 = errors;
            if (!(typeof data0[i0] == "string")) {
              validate57.errors = [
                {
                  instancePath: instancePath + "/globalCssFiles/" + i0,
                  schemaPath: "/properties/globalCssFiles/elements/type",
                  keyword: "type",
                  params: { type: "string", nullable: false },
                  message: "must be string",
                },
              ];
              return false;
            }
            var valid3 = _errs1 === errors;
            if (!valid3) {
              break;
            }
          }
          valid2 = valid3;
        } else {
          validate57.errors = [
            {
              instancePath: instancePath + "/globalCssFiles",
              schemaPath: "/properties/globalCssFiles/elements",
              keyword: "elements",
              params: { type: "array", nullable: false },
              message: "must be array",
            },
          ];
          return false;
        }
      }
      var valid1 = _errs0 === errors;
    } else {
      valid1 = false;
      validate57.errors = [
        {
          instancePath,
          schemaPath: "/properties/globalCssFiles",
          keyword: "properties",
          params: { error: "missing", missingProperty: "globalCssFiles" },
          message: "must have property 'globalCssFiles'",
        },
      ];
      return false;
    }
    if (valid1) {
      var valid4;
      if (data.include !== undefined) {
        let data2 = data.include;
        const _errs2 = errors;
        let valid5 = false;
        if (!valid5) {
          if (Array.isArray(data2)) {
            var valid6 = true;
            const len1 = data2.length;
            for (let i1 = 0; i1 < len1; i1++) {
              const _errs3 = errors;
              if (!(typeof data2[i1] == "string")) {
                validate57.errors = [
                  {
                    instancePath: instancePath + "/include/" + i1,
                    schemaPath: "/optionalProperties/include/elements/type",
                    keyword: "type",
                    params: { type: "string", nullable: false },
                    message: "must be string",
                  },
                ];
                return false;
              }
              var valid6 = _errs3 === errors;
              if (!valid6) {
                break;
              }
            }
            valid5 = valid6;
          } else {
            validate57.errors = [
              {
                instancePath: instancePath + "/include",
                schemaPath: "/optionalProperties/include/elements",
                keyword: "elements",
                params: { type: "array", nullable: false },
                message: "must be array",
              },
            ];
            return false;
          }
        }
        var valid4 = _errs2 === errors;
      } else {
        valid4 = true;
      }
      if (valid4) {
        if (data.exclude !== undefined) {
          let data4 = data.exclude;
          const _errs4 = errors;
          let valid7 = false;
          if (!valid7) {
            if (Array.isArray(data4)) {
              var valid8 = true;
              const len2 = data4.length;
              for (let i2 = 0; i2 < len2; i2++) {
                const _errs5 = errors;
                if (!(typeof data4[i2] == "string")) {
                  validate57.errors = [
                    {
                      instancePath: instancePath + "/exclude/" + i2,
                      schemaPath: "/optionalProperties/exclude/elements/type",
                      keyword: "type",
                      params: { type: "string", nullable: false },
                      message: "must be string",
                    },
                  ];
                  return false;
                }
                var valid8 = _errs5 === errors;
                if (!valid8) {
                  break;
                }
              }
              valid7 = valid8;
            } else {
              validate57.errors = [
                {
                  instancePath: instancePath + "/exclude",
                  schemaPath: "/optionalProperties/exclude/elements",
                  keyword: "elements",
                  params: { type: "array", nullable: false },
                  message: "must be array",
                },
              ];
              return false;
            }
          }
          var valid4 = _errs4 === errors;
        } else {
          valid4 = true;
        }
        if (valid4) {
          for (const key0 in data) {
            if (key0 !== "globalCssFiles" && key0 !== "include" && key0 !== "exclude") {
              validate57.errors = [
                {
                  instancePath: instancePath + "/" + key0.replace(/~/g, "~0").replace(/\//g, "~1"),
                  schemaPath: "",
                  keyword: "properties",
                  params: { error: "additional", additionalProperty: key0 },
                  message: "must NOT have additional properties",
                },
              ];
              return false;
              break;
            }
          }
        }
      }
    }
  }
  if (!valid0) {
    validate57.errors = [
      {
        instancePath,
        schemaPath: "/properties",
        keyword: "properties",
        params: { type: "object", nullable: false },
        message: "must be object",
      },
    ];
    return false;
  }
  validate57.errors = vErrors;
  return errors === 0;
}
