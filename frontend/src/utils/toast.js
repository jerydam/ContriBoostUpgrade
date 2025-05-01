import { toast } from "react-toastify";

export const showToast = (message, type = "error") => {
  const options = {
    position: "top-right",
    autoClose: 3000,
    hideProgressBar: false,
    closeOnClick: true,
    pauseOnHover: true,
    draggable: true,
    theme: "light",
    toastStyle: {
      backgroundColor: "#101b31",
      color: "#ffffff",
      border: "1px solid #6264c7",
    },
    progressStyle: {
      background: "#6264c7",
    },
  };

  switch (type) {
    case "success":
      toast.success(message, options);
      break;
    case "info":
      toast.info(message, options);
      break;
    case "warning":
      toast.warn(message, options);
      break;
    default:
      toast.error(message, options);
  }
};